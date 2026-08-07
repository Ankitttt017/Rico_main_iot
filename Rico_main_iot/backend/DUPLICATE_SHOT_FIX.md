# Duplicate Shot Detector - Fix Documentation

## Problem Summary
Your production reports were showing duplicate shot numbers (e.g., Shot 812 appearing twice, Shot 808 appearing twice) with different cycle times. This compromises data accuracy and makes reporting unreliable.

**Example from your report:**
- Row 306: Shot 812, Time 17:08:41, Cycle Time: 12.34 sec ❌ (INCOMPLETE)
- Row 305: Shot 812, Time 17:08:41, Cycle Time: 64.2 sec ✓ (VALID)

## Root Cause Analysis

### Why Duplicates Occurred:

1. **Incomplete Data Reads**: The PLC monitoring system was reading cycle data multiple times:
   - First read: Captured early/partial data (12.34 sec cycle time - unrealistically short)
   - Second read: Captured complete data (64.2 sec cycle time - normal)

2. **Weak Duplicate Detection**: The original logic only checked:
   ```
   Same Machine + Within 15 seconds + Same Shot Number
   ```
   **Problem**: If two records had the exact same timestamp but somehow different data, 
   both would be inserted, creating duplicates.

3. **No Cycle Time Validation**: The system accepted any cycle time value without questioning 
   if it was realistic or complete.

## Solution Implemented

### 1. **Enhanced Duplicate Detection (Multi-Strategy)**

```javascript
// Strategy 1: Exact Match Detection
✓ Looks for: Same machine + Exact timestamp (to the second) + Same shot number
✓ Result: Removes identical duplicates immediately

// Strategy 2: Time Window with Cycle Time Intelligence
✓ Looks for: Same machine + Shot number + Within 15 second window
✓ Compares: Cycle times of duplicate candidates
✓ Decision:
  - If new record has INVALID cycle time (< 5 sec) but DB has VALID one → SKIP new
  - If new record has VALID cycle time and DB has INVALID one → KEEP new (replace)
  - If both valid or both invalid → SKIP new as duplicate
```

### 2. **Cycle Time Validation**
- Added check to reject shots with cycle times less than minimum (default: 5 seconds)
- Most injection molding cycles take 30-120 seconds, so <5 sec indicates incomplete data
- Returns: `"incomplete-cycle-time"` skip reason

### 3. **Improved Duplicate Detection Logic Flow**

```
INCOMING SHOT DATA
    ↓
[Check 1] Missing timestamp? 
    → SKIP: "missing-plc-shot-datetime"
    ↓
[Check 2] Invalid cycle time (< 5 sec)?
    → SKIP: "incomplete-cycle-time"
    ↓
[Check 3] Exact timestamp + shot number match?
    → SKIP: "duplicate-exact-timestamp-shot"
    ↓
[Check 4] Within 15 sec + same shot number?
    → Compare cycle times
    → SKIP if DB version is better
    ↓
[SAVE] All checks passed → Insert new record
```

## Database Cleanup

A SQL cleanup script is provided: `cleanup-duplicate-shots.sql`

**What it does:**
- Identifies all duplicate shots (same machine + shot number)
- Keeps the record with VALID cycle time (≥ 5 seconds)
- Removes all duplicate/incomplete records
- Flags anomalies for review (very short cycle times)

**How to use:**
```bash
# On Windows with SQL Server
sqlcmd -S YOUR_SERVER -d rico_iot_db -i scripts/cleanup-duplicate-shots.sql

# Or run in SQL Server Management Studio:
# File → Open → scripts/cleanup-duplicate-shots.sql → Execute
```

## Expected Results

### Before Fix:
```
Shot 812: 2 records (cycle times 12.34, 64.2)     ❌ DUPLICATE
Shot 808: 2 records (cycle times 63.6, 64.2)      ❌ DUPLICATE  
Shot 806: 2 records (cycle times 64.0, 64.0)      ❌ DUPLICATE
```

### After Fix:
```
Shot 812: 1 record (cycle time 64.2)     ✓ VALID
Shot 808: 1 record (cycle time 64.2)     ✓ VALID
Shot 806: 1 record (cycle time 64.0)     ✓ VALID
```

## Configuration

You can adjust the duplicate detection window if needed:

```bash
# In your .env file:
PLC_DUPLICATE_SHOT_WINDOW_SEC=15      # Default 15 seconds (adjust if needed)
PLC_MIN_VALID_CYCLE_TIME_SEC=5        # Default 5 seconds (minimum valid cycle)
```

## Monitoring

The system now logs duplicate detection:
- Console logs show which duplicates were skipped and why
- Machine state includes messages like:
  - "shot 812 checked: duplicate-exact-timestamp-shot"
  - "shot 813 checked: duplicate-incomplete-cycle"

## Testing the Fix

After applying the fix, the next cycle end events will use the new duplicate detection.

To test manually:
1. Start the PLC monitor
2. Run a few cycles on the machine
3. Check the database for duplicate shots - should be ZERO
4. Verify cycle times are consistent and reasonable (>5 sec)

## Files Modified

- **plcMonitorService.js**: Enhanced `saveToDBUnlocked()` function with:
  - Cycle time validation
  - Exact timestamp duplicate detection
  - Intelligent cycle time comparison for time-window duplicates

- **cleanup-duplicate-shots.sql**: New cleanup script for existing duplicates

## Support

If duplicates still appear after this fix:
1. Check console logs for error messages
2. Verify `PLC_MIN_VALID_CYCLE_TIME_SEC` is appropriate for your machines
3. Increase `PLC_DUPLICATE_SHOT_WINDOW_SEC` if cycle variations are large
4. Check PLC connection stability - intermittent connections can cause partial reads
