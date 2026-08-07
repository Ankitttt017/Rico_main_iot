-- ============================================================================
-- Cleanup Duplicate Shots Script
-- ============================================================================
-- This script removes duplicate shot records from the UBE_REPORT table
-- while preserving the record with valid cycle time information.
-- ============================================================================

USE [rico_iot_db];

-- Set transaction isolation level
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- Show summary before cleanup
PRINT '=== DUPLICATE SHOTS SUMMARY BEFORE CLEANUP ===';
SELECT 
    machine_key,
    [Counter] as shot_number,
    COUNT(*) as duplicate_count,
    MIN([Cycle Time (SEC)]) as min_cycle_time,
    MAX([Cycle Time (SEC)]) as max_cycle_time,
    MIN([recorded_at]) as earliest_record,
    MAX([recorded_at]) as latest_record
FROM UBE_REPORT
WHERE [Counter] IS NOT NULL
GROUP BY machine_key, [Counter]
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, machine_key;

-- ============================================================================
-- DELETE duplicates: Keep best record, remove incomplete/duplicate reads
-- ============================================================================

PRINT '';
PRINT '=== REMOVING DUPLICATE SHOTS ===';

DELETE FROM UBE_REPORT
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            machine_key,
            [Counter] as shot_number,
            CAST([Cycle Time (SEC)] AS FLOAT) as cycle_time,
            recorded_at,
            -- Rank by: valid cycle time (>5 sec), then by recency, then by ID desc
            ROW_NUMBER() OVER (
                PARTITION BY machine_key, [Counter] 
                ORDER BY 
                    CASE WHEN CAST([Cycle Time (SEC)] AS FLOAT) >= 5 THEN 0 ELSE 1 END ASC,
                    recorded_at DESC,
                    id DESC
            ) as rn
        FROM UBE_REPORT
        WHERE [Counter] IS NOT NULL
    ) ranked
    WHERE rn > 1  -- Keep only first (highest rank), delete the rest
);

-- Show count of deleted records
PRINT 'Deleted duplicate records.';

-- ============================================================================
-- Verify cleanup
-- ============================================================================

PRINT '';
PRINT '=== VERIFICATION: Checking for remaining duplicates ===';
SELECT 
    machine_key,
    [Counter] as shot_number,
    COUNT(*) as count
FROM UBE_REPORT
WHERE [Counter] IS NOT NULL
GROUP BY machine_key, [Counter]
HAVING COUNT(*) > 1;

IF @@ROWCOUNT = 0
    PRINT 'SUCCESS: No duplicate shots remaining!';
ELSE
    PRINT 'WARNING: Some duplicates still exist. Manual review needed.';

-- ============================================================================
-- Show anomalies to review
-- ============================================================================

PRINT '';
PRINT '=== ANOMALIES TO REVIEW (very short cycle times) ===';
SELECT TOP 20
    id,
    recorded_at,
    machine_key,
    machine_name,
    [Counter] as shot_number,
    CAST([Cycle Time (SEC)] AS FLOAT) as cycle_time,
    [HIGH SHOT COUNT] as ok_shot
FROM UBE_REPORT
WHERE CAST([Cycle Time (SEC)] AS FLOAT) BETWEEN 0.1 AND 4.9
ORDER BY recorded_at DESC;

PRINT '';
PRINT '=== CLEANUP COMPLETE ===';
