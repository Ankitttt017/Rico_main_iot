"use strict";

const { QUAD_MQTT, isQuadIngestEnabled } = require("../config/quadConfig");
const { QuadMessageError, parseQuadTelemetry, parseQuadStatus } = require("./quadPayloadMapper");

// MQTT subscriber for the QUAD edge gateway.
//   quad/<machine_id>/telemetry  -> one shot: save to PlcCycleReadings + live screen, then ACK
//   quad/<machine_id>/status     -> online / offline (retained, broker last will)
//   quad/<machine_id>/ack        <- {"event_uuid": "...", "status": "SAVED" | "DUPLICATE" | "ERROR"}
// The ACK is published only after the DB commit (or when the shot is already stored).
// No ACK on a DB error would leave QUAD waiting 300 s; ERROR makes it resend in about 60 s.

function topicParts(topic) {
  const parts = String(topic || "").split("/");
  const prefixLength = QUAD_MQTT.topicPrefix.split("/").length;
  if (parts.length !== prefixLength + 2) return null;
  return { machineId: parts[prefixLength], kind: parts[prefixLength + 1] };
}

function startQuadIngest(plcMonitor, { mqttLib = require("mqtt"), logger = console } = {}) {
  if (!isQuadIngestEnabled()) {
    logger.log("[QUAD] MQTT ingest disabled (MQTT_URL not set)");
    return { stop: async () => { } };
  }
  if (typeof plcMonitor?.handleQuadTelemetry !== "function") {
    logger.warn("[QUAD] MQTT ingest not started: PLC monitor is disabled");
    return { stop: async () => { } };
  }

  const telemetryTopic = `${QUAD_MQTT.topicPrefix}/+/telemetry`;
  const statusTopic = `${QUAD_MQTT.topicPrefix}/+/status`;
  const client = mqttLib.connect(QUAD_MQTT.url, {
    clientId: QUAD_MQTT.clientId,
    clean: false, // persistent session: shots published while the backend is down are delivered later
    username: QUAD_MQTT.username,
    password: QUAD_MQTT.password,
    reconnectPeriod: QUAD_MQTT.reconnectPeriodMs,
    connectTimeout: QUAD_MQTT.connectTimeoutMs,
    keepalive: QUAD_MQTT.keepaliveSec,
  });

  // Shots of one machine are handled one at a time, in arrival order.
  const queues = new Map();
  const enqueue = (machineId, task) => {
    const previous = queues.get(machineId) || Promise.resolve();
    const next = previous.then(task, task);
    queues.set(machineId, next.finally(() => {
      if (queues.get(machineId) === next) queues.delete(machineId);
    }));
    return next;
  };

  const publishAck = (machineId, eventUuid, status, error = null) => {
    const body = { event_uuid: eventUuid, status };
    if (error) body.error = String(error).slice(0, 300);
    client.publish(
      `${QUAD_MQTT.topicPrefix}/${machineId}/ack`,
      JSON.stringify(body),
      { qos: 1, retain: false },
      (publishError) => {
        if (publishError) logger.error(`[QUAD] ACK publish failed (${machineId} ${eventUuid}):`, publishError.message);
      }
    );
  };

  const handleTelemetry = async (topicMachineId, payload) => {
    let telemetry;
    try {
      telemetry = parseQuadTelemetry(payload);
    } catch (error) {
      // Without a readable event_uuid there is nothing to acknowledge; QUAD resends after 300 s.
      logger.error(`[QUAD] Ignored bad telemetry on ${topicMachineId}: ${error.message}`);
      return;
    }

    try {
      const result = await plcMonitor.handleQuadTelemetry(telemetry);
      if (!result.ack) {
        if (result.reason !== "duplicate-cycle-in-flight") {
          const from = telemetry.gatewayIp ? ` (QUAD IP ${telemetry.gatewayIp})` : "";
          logger.warn(`[QUAD] ${telemetry.machineId}${from} shot ${telemetry.eventUuid} not acknowledged: ${result.reason}`);
        }
        return;
      }
      publishAck(telemetry.machineId, telemetry.eventUuid, result.ack);
    } catch (error) {
      const permanent = error instanceof QuadMessageError;
      logger.error(`[QUAD] ${telemetry.machineId} shot ${telemetry.eventUuid} ${permanent ? "rejected" : "save failed"}: ${error.message}`);
      if (!permanent) publishAck(telemetry.machineId, telemetry.eventUuid, "ERROR", error.message);
    }
  };

  client.on("connect", () => {
    logger.log(`[QUAD] MQTT connected to ${QUAD_MQTT.url} as ${QUAD_MQTT.clientId}`);
    client.subscribe({ [telemetryTopic]: { qos: 1 }, [statusTopic]: { qos: 1 } }, (error) => {
      if (error) logger.error("[QUAD] MQTT subscribe failed:", error.message);
      else logger.log(`[QUAD] Subscribed to ${telemetryTopic} and ${statusTopic}`);
    });
  });
  client.on("reconnect", () => logger.warn("[QUAD] MQTT reconnecting..."));
  client.on("offline", () => logger.warn("[QUAD] MQTT broker unreachable"));
  client.on("error", (error) => logger.error("[QUAD] MQTT error:", error.message));

  client.on("message", (topic, payload) => {
    const parts = topicParts(topic);
    if (!parts) return;
    if (parts.kind === "status") {
      const logStatusError = (error) =>
        logger.error(`[QUAD] Status handling failed for ${parts.machineId}:`, error.message);
      try {
        const status = parseQuadStatus(payload);
        if (status) Promise.resolve(plcMonitor.handleQuadStatus(parts.machineId, status)).catch(logStatusError);
      } catch (error) {
        logStatusError(error);
      }
      return;
    }
    if (parts.kind === "telemetry") {
      enqueue(parts.machineId, () => handleTelemetry(parts.machineId, payload)).catch((error) => {
        logger.error(`[QUAD] Telemetry handling failed for ${parts.machineId}:`, error.message);
      });
    }
  });

  return {
    client,
    stop: () => new Promise((resolve) => client.end(false, {}, () => resolve())),
  };
}

module.exports = {
  startQuadIngest,
};
