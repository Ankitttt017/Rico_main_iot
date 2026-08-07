# Quick Fix Guide - Duplicate Shots

## Immediate Action Required

### Step 1: Apply Code Fix ✓ (Already Done)
The duplicate detection logic has been updated in:
- `backend/src/modules/plcMonitor/services/plcMonitorService.js`

**Future shots will NOT have duplicates.**

### Step 2: Clean Existing Duplicates (Do This Now)

Run the cleanup script to remove duplicate records already in your database:

#### Option A: Using SQL Server Management Studio
1. Open SQL Server Management Studio
2. Connect to your database server
3. File → Open → Select `scripts/cleanup-duplicate-shots.sql`
4. Click Execute (or press F5)
5. Review the results

#### Option B: Using Command Line
```bash
cd backend
sqlcmd -S YOUR_SERVER -d rico_iot_db -i scripts/cleanup-duplicate-shots.sql
```

Replace `YOUR_SERVER` with your actual server name (e.g., `.\SQLEXPRESS` or `DESKTOP-ABC123`)

#### Option C: Using PowerShell
```powershell
cd backend
$password = Read-Host "Enter database password (if needed)" -AsSecureString
Invoke-Sqlcmd -ServerInstance ".\SQLEXPRESS" -Database "rico_iot_db" -InputFile "scripts/cleanup-duplicate-shots.sql"
```

### Step 3: Restart the PLC Monitor
```bash
# In backend directory
pm2 restart all
# or
npm run dev
```

## What Gets Removed?

The cleanup script will:
- ✓ Remove duplicate shot records
- ✓ Keep the one with VALID cycle time data
- ✓ Report anomalies (very short cycle times)
- ✓ Verify no duplicates remain

## Before Running Cleanup

⚠️ **BACKUP YOUR DATABASE FIRST!**

```sql
-- If you want to backup first, run in SQL Server:
BACKUP DATABASE [rico_iot_db] 
TO DISK = 'C:\Backups\rico_iot_db_backup.bak'
WITH INIT;
```

## Verify the Fix Worked

After cleanup, check your reports:
1. Open Production Reports page
2. Look for any shot numbers appearing multiple times
3. Verify cycle times are reasonable (30-120 sec typical)
4. All cycle times for a shot should be identical now ✓

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Duplicate Shots | Multiple | Zero |
| Data Accuracy | Low | High ✓ |
| Report Counts | Inflated | Accurate ✓ |
| Cycle Time Data | Mixed/Invalid | Consistent ✓ |

## Troubleshooting

**Q: How many records will be deleted?**
A: Run the script first - it shows a summary before deleting. You can cancel if the number seems wrong.

**Q: Can I undo the cleanup?**
A: Yes, if you made a backup (Step 1). If not, deleted records cannot be recovered from a live database.

**Q: Still seeing duplicates after cleanup?**
A: 
- Clear browser cache and refresh the page
- Restart the node.js backend
- Check new shots coming in (they should be clean now)

**Q: What if the same shot appears with DIFFERENT cycle times after cleanup?**
A: This would indicate a real setup issue:
- PLC sending inconsistent data
- Network timing issues causing partial reads
- Need to investigate PLC configuration

## Support Information

If issues persist:
1. Check `backend/src/modules/plcMonitor/services/plcMonitorService.js` for error logs
2. Verify `PLC_MIN_VALID_CYCLE_TIME_SEC` environment variable matches your setup
3. Review network stability to PLC
4. Check PLC firmware for data transmission issues

📋 Full documentation: See `DUPLICATE_SHOT_FIX.md`
