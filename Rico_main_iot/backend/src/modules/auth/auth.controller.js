"use strict";

const crypto = require("crypto");
const db = require("../../config/db");

let schemaReadyPromise = null;

const PERMISSIONS = {
  MASTER_MANAGE: "master:manage",
  MASTER_VIEW: "master:view",
  PLC_MANAGE: "plc:manage",
  PLC_VIEW: "plc:view",
  WORKSTATION_VIEW: "workstation:view",
  WORKSTATION_OPERATE: "workstation:operate",
  DOWNTIME_VIEW: "downtime:view",
  DOWNTIME_MANAGE: "downtime:manage",
  REPORTS_VIEW: "reports:view",
  REPORTS_EXPORT: "reports:export",
  TRACEABILITY_VIEW: "traceability:view",
  CAMERA_VIEW: "camera:view",
  NG_VIEW: "ng:view",
  ROLES_MANAGE: "roles:manage",
  SYSTEM_CONFIG: "system:config",
};

const ROLE_DEFINITIONS = {
  SYSTEM_ADMIN: {
    label: "System Administrator",
    legacyKeys: ["administrator", "admin", "system_admin"],
    description: "Full access for IT and system owners",
    landingPath: "/dashboard",
    defaultUsername: "admin",
    defaultPassword: "admin121",
    permissions: [
      PERMISSIONS.MASTER_MANAGE,
      PERMISSIONS.MASTER_VIEW,
      PERMISSIONS.PLC_MANAGE,
      PERMISSIONS.PLC_VIEW,
      PERMISSIONS.WORKSTATION_VIEW,
      PERMISSIONS.WORKSTATION_OPERATE,
      PERMISSIONS.DOWNTIME_VIEW,
      PERMISSIONS.DOWNTIME_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.TRACEABILITY_VIEW,
      PERMISSIONS.CAMERA_VIEW,
      PERMISSIONS.NG_VIEW,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.SYSTEM_CONFIG,
    ],
  },
  PLANT_MANAGER: {
    label: "Plant Manager",
    legacyKeys: ["plant_manager"],
    description: "Reports and KPI focused view access",
    landingPath: "/dashboard",
    defaultUsername: "plant.manager",
    defaultPassword: "Plant1234",
    permissions: [
      PERMISSIONS.MASTER_VIEW,
      PERMISSIONS.PLC_VIEW,
      PERMISSIONS.WORKSTATION_VIEW,
      PERMISSIONS.DOWNTIME_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.TRACEABILITY_VIEW,
      PERMISSIONS.CAMERA_VIEW,
      PERMISSIONS.NG_VIEW,
    ],
  },
  SHIFT_SUPERVISOR: {
    label: "Shift Supervisor",
    legacyKeys: ["supervisor", "shift_supervisor"],
    description: "Monitor, operate and log downtime",
    landingPath: "/plc-monitor",
    defaultUsername: "supervisor",
    defaultPassword: "supervisor121",
    permissions: [
      PERMISSIONS.PLC_VIEW,
      PERMISSIONS.WORKSTATION_VIEW,
      PERMISSIONS.WORKSTATION_OPERATE,
      PERMISSIONS.DOWNTIME_VIEW,
      PERMISSIONS.DOWNTIME_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.TRACEABILITY_VIEW,
      PERMISSIONS.CAMERA_VIEW,
      PERMISSIONS.NG_VIEW,
    ],
  },
  QUALITY_INSPECTOR: {
    label: "Quality Inspector",
    legacyKeys: ["quality_inspector"],
    description: "Quality data, NG signals and traceability",
    landingPath: "/plc-report",
    defaultUsername: "quality",
    defaultPassword: "Quality1234",
    permissions: [
      PERMISSIONS.PLC_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.TRACEABILITY_VIEW,
      PERMISSIONS.CAMERA_VIEW,
      PERMISSIONS.NG_VIEW,
    ],
  },
  OPERATOR: {
    label: "Operator",
    legacyKeys: ["operator"],
    description: "Shopfloor workstation only",
    landingPath: "/operator-workstation",
    defaultUsername: "operator",
    defaultPassword: "operator121",
    permissions: [PERMISSIONS.WORKSTATION_VIEW, PERMISSIONS.WORKSTATION_OPERATE],
  },
};

function roleKey(value) {
  const raw = String(value || "OPERATOR").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (ROLE_DEFINITIONS[raw]) return raw;
  const lower = String(value || "").trim().toLowerCase();
  const match = Object.entries(ROLE_DEFINITIONS).find(([, role]) => role.legacyKeys.includes(lower));
  return match ? match[0] : "OPERATOR";
}

function parsePermissions(value, role) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.filter(Boolean).length) return parsed.filter(Boolean);
    } catch {
      const values = value.split(",").map((item) => item.trim()).filter(Boolean);
      if (values.length) return values;
    }
  }
  return ROLE_DEFINITIONS[roleKey(role)]?.permissions || ROLE_DEFINITIONS.OPERATOR.permissions;
}

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(String(value || ""), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const text = String(storedHash || "");
  if (text.startsWith("pbkdf2$")) {
    const [, iterationsText, salt, hash] = text.split("$");
    const iterations = Number(iterationsText);
    const nextHash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(nextHash, "hex"), Buffer.from(hash, "hex"));
  }
  const legacyHash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
  return text === legacyHash;
}

function normalizeUser(row = {}) {
  const role = roleKey(row.role);
  const meta = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.OPERATOR;
  const permissions = parsePermissions(row.permissions_json, role);
  return {
    id: row.id || null,
    username: row.username,
    fullName: row.full_name || row.display_name || row.username,
    name: row.full_name || row.display_name || row.username,
    employeeId: row.employee_id || "",
    email: row.email || "",
    department: row.department || "",
    role,
    role_key: role,
    roleLabel: meta.label,
    role: meta.label,
    permissions,
    landingPath: row.landing_path || meta.landingPath,
    isActive: row.is_active === true || row.is_active === 1,
    forcePasswordChange: row.force_password_change === true || row.force_password_change === 1,
    locked: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function apiUser(row = {}) {
  const normalized = normalizeUser(row);
  return {
    ...normalized,
    role: normalized.role_key,
    roleLabel: ROLE_DEFINITIONS[normalized.role_key]?.label || normalized.role,
  };
}

async function ensureColumn(name, ddl) {
  await db.run(`
IF COL_LENGTH('dbo.app_users', '${name}') IS NULL
BEGIN
  ALTER TABLE dbo.app_users ADD ${ddl}
END`);
}

async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await db.run(`
IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_users (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_app_users PRIMARY KEY,
    username NVARCHAR(80) NOT NULL CONSTRAINT UQ_app_users_username UNIQUE,
    display_name NVARCHAR(120) NULL,
    role NVARCHAR(40) NOT NULL,
    password_hash NVARCHAR(256) NOT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_app_users_is_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_app_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_app_users_updated_at DEFAULT SYSUTCDATETIME()
  );
END`);

      await ensureColumn("full_name", "full_name NVARCHAR(160) NULL");
      await ensureColumn("employee_id", "employee_id NVARCHAR(60) NULL");
      await ensureColumn("email", "email NVARCHAR(160) NULL");
      await ensureColumn("department", "department NVARCHAR(120) NULL");
      await ensureColumn("permissions_json", "permissions_json NVARCHAR(MAX) NULL");
      await ensureColumn("landing_path", "landing_path NVARCHAR(160) NULL");
      await ensureColumn("failed_attempts", "failed_attempts INT NOT NULL CONSTRAINT DF_app_users_failed_attempts DEFAULT 0");
      await ensureColumn("locked_until", "locked_until DATETIME2 NULL");
      await ensureColumn("force_password_change", "force_password_change BIT NOT NULL CONSTRAINT DF_app_users_force_pwd DEFAULT 0");
      await db.run(`
IF OBJECT_ID(N'dbo.audit_log', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_log (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_log PRIMARY KEY,
    action NVARCHAR(80) NOT NULL,
    performed_by NVARCHAR(120) NULL,
    target_user NVARCHAR(120) NULL,
    details NVARCHAR(MAX) NULL,
    timestamp DATETIME2 NOT NULL CONSTRAINT DF_audit_log_timestamp DEFAULT SYSUTCDATETIME()
  );
END`);

      for (const [key, meta] of Object.entries(ROLE_DEFINITIONS)) {
        await db.run(`
IF NOT EXISTS (SELECT 1 FROM dbo.app_users WHERE LOWER(username) = LOWER(?))
BEGIN
  INSERT INTO dbo.app_users (username, display_name, full_name, role, password_hash, permissions_json, landing_path, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
END`,
          [
            meta.defaultUsername,
            meta.defaultUsername,
            meta.label,
            meta.label,
            key,
            hashPassword(meta.defaultPassword),
            JSON.stringify(meta.permissions),
            meta.landingPath,
          ]
        );
      }

      await db.run(`
UPDATE dbo.app_users
SET role = CASE
    WHEN LOWER(role) IN ('administrator','admin','system administrator') THEN 'SYSTEM_ADMIN'
    WHEN LOWER(role) IN ('supervisor','shift supervisor') THEN 'SHIFT_SUPERVISOR'
    WHEN LOWER(role) IN ('operator') THEN 'OPERATOR'
    ELSE role
  END,
  full_name = COALESCE(full_name, display_name),
  permissions_json = COALESCE(permissions_json, '[]'),
  landing_path = COALESCE(landing_path, CASE
    WHEN LOWER(role) IN ('operator') THEN '/operator-workstation'
    ELSE '/dashboard'
  END)
WHERE role IS NOT NULL`);
      await db.run(
        "UPDATE dbo.app_users SET is_active = 1, updated_at = SYSUTCDATETIME() WHERE LOWER(username) = LOWER(?)",
        [ROLE_DEFINITIONS.SYSTEM_ADMIN.defaultUsername]
      );
      await db.run("UPDATE dbo.app_users SET failed_attempts = 0, locked_until = NULL WHERE locked_until IS NOT NULL OR failed_attempts <> 0");
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

function roleDto([key, value]) {
  return {
    key,
    label: value.label,
    description: value.description,
    permissions: value.permissions,
    landingPath: value.landingPath,
  };
}

async function audit(action, performedBy, targetUser, details = {}) {
  try {
    await db.run(
      "INSERT INTO dbo.audit_log (action, performed_by, target_user, details) VALUES (?, ?, ?, ?)",
      [action, performedBy || "system", targetUser || "", JSON.stringify(details)]
    );
  } catch {
    // Audit failure should not block user operations.
  }
}

async function isSystemAdminActor(username) {
  const actor = String(username || "").trim();
  if (!actor) return false;
  if (actor.toLowerCase() === ROLE_DEFINITIONS.SYSTEM_ADMIN.defaultUsername) return true;
  const { rows } = await db.query(
    "SELECT TOP 1 role FROM dbo.app_users WHERE LOWER(username) = LOWER(?) AND is_active = 1",
    [actor]
  );
  return roleKey(rows[0]?.role) === "SYSTEM_ADMIN";
}

async function login(req, res) {
  try {
    await ensureSchema();
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const { rows } = await db.query(
      `SELECT TOP 1 *
       FROM dbo.app_users
       WHERE LOWER(username) = LOWER(?) AND is_active = 1`,
      [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ success: false, message: "Invalid username or password." });

    if (!verifyPassword(password, user.password_hash)) {
      await db.run(
        "UPDATE dbo.app_users SET failed_attempts = 0, locked_until = NULL, updated_at = SYSUTCDATETIME() WHERE id = ?",
        [user.id]
      );
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    await db.run(
      "UPDATE dbo.app_users SET failed_attempts = 0, locked_until = NULL, updated_at = SYSUTCDATETIME() WHERE id = ?",
      [user.id]
    );

    res.json({ success: true, data: normalizeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to login.", error: error.message });
  }
}

async function listRoles(_req, res) {
  res.json({ success: true, data: Object.entries(ROLE_DEFINITIONS).map(roleDto), permissions: PERMISSIONS });
}

async function listUsers(_req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query("SELECT * FROM dbo.app_users ORDER BY created_at DESC, id DESC");
    res.json({ success: true, data: rows.map(apiUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to load users.", error: error.message });
  }
}

async function checkUsername(req, res) {
  try {
    await ensureSchema();
    const username = String(req.query.u || "").trim();
    if (!username) return res.json({ success: true, available: false });
    const { rows } = await db.query("SELECT TOP 1 id FROM dbo.app_users WHERE LOWER(username) = LOWER(?)", [username]);
    res.json({ success: true, available: rows.length === 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to check username.", error: error.message });
  }
}

function validateUserInput(body, { edit = false } = {}) {
  const errors = [];
  const username = String(body.username || "").replace(/\s+/g, " ").trim();
  const fullName = String(body.fullName || body.full_name || username).trim();
  const password = String(body.password || "");
  const role = roleKey(body.role);
  if (!edit && !fullName) errors.push("Username is required.");
  if (!edit && !/^[A-Za-z][A-Za-z0-9 ._-]{2,79}$/.test(username)) errors.push("Username must be 3-80 characters and can include letters, numbers, spaces, dots, underscores, or hyphens.");
  if (!edit && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) errors.push("Password min 8 chars, 1 uppercase, 1 number.");
  if (edit && password && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) errors.push("Password min 8 chars, 1 uppercase, 1 number.");
  if (!ROLE_DEFINITIONS[role]) errors.push("Valid role is required.");
  return { errors, username, fullName, role };
}

async function createUser(req, res) {
  try {
    await ensureSchema();
    const { errors, username, fullName, role } = validateUserInput(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
    const existing = await db.query("SELECT TOP 1 id FROM dbo.app_users WHERE LOWER(username) = LOWER(?)", [username]);
    if (existing.rows.length) return res.status(409).json({ success: false, error: "USERNAME_TAKEN", message: `Username '${username}' already exists` });

    const roleMeta = ROLE_DEFINITIONS[role];
    const permissions = Array.isArray(req.body.permissions) && req.body.permissions.length ? req.body.permissions : roleMeta.permissions;
    const landingPath = req.body.landingPath || roleMeta.landingPath;
    const result = await db.query(
      `INSERT INTO dbo.app_users
       (username, display_name, full_name, employee_id, email, department, role, password_hash, permissions_json, landing_path, is_active, force_password_change)
       OUTPUT INSERTED.*
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        username,
        fullName,
        fullName,
        req.body.employeeId || "",
        req.body.email || "",
        req.body.department || "",
        role,
        hashPassword(req.body.password),
        JSON.stringify(permissions),
        landingPath,
        req.body.forcePasswordChange === false ? 0 : 1,
      ]
    );
    const user = apiUser(result.rows[0]);
    await audit("USER_CREATED", req.body.performedBy || "admin", username, { role, permissions });
    res.status(201).json({ success: true, user, data: user, message: `User "${fullName}" created as ${roleMeta.label}` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to create user.", error: error.message });
  }
}

async function updateUser(req, res) {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const { errors, fullName, role } = validateUserInput(req.body, { edit: true });
    if (!id) return res.status(400).json({ success: false, message: "Valid user id required." });
    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
    const roleMeta = ROLE_DEFINITIONS[role];
    const existingUser = await db.query("SELECT TOP 1 username, role FROM dbo.app_users WHERE id = ?", [id]);
    if (!existingUser.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    const isBuiltinAdmin = String(existingUser.rows[0].username || "").toLowerCase() === ROLE_DEFINITIONS.SYSTEM_ADMIN.defaultUsername;
    const permissions = Array.isArray(req.body.permissions) && req.body.permissions.length ? req.body.permissions : roleMeta.permissions;
    const landingPath = req.body.landingPath || roleMeta.landingPath;
    if (req.body.password) {
      if (!(await isSystemAdminActor(req.body.performedBy))) {
        return res.status(403).json({ success: false, message: "Only a system administrator can update passwords." });
      }
      await db.run(
        `UPDATE dbo.app_users
         SET display_name=?, full_name=?, employee_id=?, email=?, department=?, role=?, password_hash=?,
             permissions_json=?, landing_path=?, is_active=?, updated_at=SYSUTCDATETIME()
         WHERE id=?`,
        [
          fullName,
          fullName,
          req.body.employeeId || "",
          req.body.email || "",
          req.body.department || "",
          role,
          hashPassword(req.body.password),
          JSON.stringify(permissions),
          landingPath,
          isBuiltinAdmin ? 1 : req.body.isActive === false ? 0 : 1,
          id,
        ]
      );
    } else {
      await db.run(
        `UPDATE dbo.app_users
         SET display_name=?, full_name=?, employee_id=?, email=?, department=?, role=?,
             permissions_json=?, landing_path=?, is_active=?, updated_at=SYSUTCDATETIME()
         WHERE id=?`,
        [
          fullName,
          fullName,
          req.body.employeeId || "",
          req.body.email || "",
          req.body.department || "",
          role,
          JSON.stringify(permissions),
          landingPath,
          isBuiltinAdmin ? 1 : req.body.isActive === false ? 0 : 1,
          id,
        ]
      );
    }
    const { rows } = await db.query("SELECT TOP 1 * FROM dbo.app_users WHERE id = ?", [id]);
    const user = apiUser(rows[0]);
    await audit("USER_UPDATED", req.body.performedBy || "admin", user.username, { role, permissions });
    res.json({ success: true, user, data: user, message: "User updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to update user.", error: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const { rows } = await db.query("SELECT TOP 1 username, role FROM dbo.app_users WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });
    if (String(rows[0].username || "").toLowerCase() === ROLE_DEFINITIONS.SYSTEM_ADMIN.defaultUsername) {
      return res.status(400).json({ success: false, message: "Default admin cannot be deleted." });
    }
    if (roleKey(rows[0].role) === "SYSTEM_ADMIN") {
      const admins = await db.query("SELECT COUNT(*) AS total FROM dbo.app_users WHERE role = 'SYSTEM_ADMIN' AND is_active = 1");
      if (Number(admins.rows[0]?.total || 0) <= 1) {
        return res.status(400).json({ success: false, message: "At least one active system admin is required." });
      }
    }
    await db.run("DELETE FROM dbo.app_users WHERE id = ?", [id]);
    await audit("USER_DELETED", req.body?.performedBy || "admin", rows[0].username);
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to delete user.", error: error.message });
  }
}

async function toggleUser(req, res) {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const current = await db.query("SELECT TOP 1 username, role, is_active FROM dbo.app_users WHERE id = ?", [id]);
    if (!current.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    if (String(current.rows[0].username || "").toLowerCase() === ROLE_DEFINITIONS.SYSTEM_ADMIN.defaultUsername) {
      return res.status(400).json({ success: false, message: "Default admin cannot be disabled." });
    }
    if (roleKey(current.rows[0].role) === "SYSTEM_ADMIN" && (current.rows[0].is_active === true || current.rows[0].is_active === 1)) {
      const admins = await db.query("SELECT COUNT(*) AS total FROM dbo.app_users WHERE role = 'SYSTEM_ADMIN' AND is_active = 1");
      if (Number(admins.rows[0]?.total || 0) <= 1) {
        return res.status(400).json({ success: false, message: "At least one active system admin is required." });
      }
    }
    await db.run("UPDATE dbo.app_users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at=SYSUTCDATETIME() WHERE id = ?", [id]);
    const { rows } = await db.query("SELECT TOP 1 * FROM dbo.app_users WHERE id = ?", [id]);
    res.json({ success: true, user: apiUser(rows[0]), data: apiUser(rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to update user status.", error: error.message });
  }
}

async function resetPassword(req, res) {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const password = String(req.body.password || "");
    if (!(await isSystemAdminActor(req.body.performedBy))) {
      return res.status(403).json({ success: false, message: "Only a system administrator can reset passwords." });
    }
    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({ success: false, message: "Password min 8 chars, 1 uppercase, 1 number." });
    }
    await db.run(
      "UPDATE dbo.app_users SET password_hash=?, failed_attempts=0, locked_until=NULL, force_password_change=1, updated_at=SYSUTCDATETIME() WHERE id=?",
      [hashPassword(password), id]
    );
    res.json({ success: true, message: "Password reset" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to reset password.", error: error.message });
  }
}

module.exports = {
  PERMISSIONS,
  ROLE_DEFINITIONS,
  ensureSchema,
  listRoles,
  login,
  listUsers,
  checkUsername,
  createUser,
  updateUser,
  deleteUser,
  toggleUser,
  resetPassword,
};
