-- Backfill phone numbers with the Pakistan country code.
--
-- Turns the old bare form into the form the app now writes:
--     03001234567  ->  923001234567
--     0421234567   ->  92421234567
-- Leading (trunk) zeros are stripped, NOT trailing ones — trailing would eat a
-- real digit off every number ending in 0.
--
-- No "+" and no separators: the backend @Pattern on users.contact_number,
-- stores.contact and parties.contact is \d{7,15}, and wa.me wants the same.
--
-- Safe to re-run. The `~ '^0'` predicate only matches un-backfilled rows; once a
-- row starts with 92 it is skipped forever.
--
-- Take a backup first — ./backup.sh at the repo root.

BEGIN;

-- ── 1. Pre-flight: users.contact_number is UNIQUE and is a login identifier ──
-- Backfilling can collide two accounts into one number. Both queries must come
-- back EMPTY. If either returns rows, stop and resolve those accounts by hand.

-- 1a. Two old rows that would collapse onto the same new number:
SELECT '92' || regexp_replace(contact_number, '^0+', '') AS new_number,
       count(*)                                          AS rows_colliding,
       array_agg(id)                                     AS user_ids
FROM users
WHERE contact_number ~ '^0'
GROUP BY 1
HAVING count(*) > 1;

-- 1b. An old row that would land on a number some account already holds:
SELECT u.id, u.contact_number,
       '92' || regexp_replace(u.contact_number, '^0+', '') AS new_number
FROM users u
WHERE u.contact_number ~ '^0'
  AND EXISTS (
    SELECT 1 FROM users x
    WHERE x.contact_number = '92' || regexp_replace(u.contact_number, '^0+', '')
  );

-- ── 2. The backfill ─────────────────────────────────────────────────────────
-- The length guard keeps every result inside the 15-digit @Pattern ceiling;
-- anything longer is malformed data and is left for step 4 to surface.

UPDATE users
SET contact_number = '92' || regexp_replace(contact_number, '^0+', '')
WHERE contact_number ~ '^0'
  AND length('92' || regexp_replace(contact_number, '^0+', '')) BETWEEN 7 AND 15;

UPDATE stores
SET contact = '92' || regexp_replace(contact, '^0+', '')
WHERE contact ~ '^0'
  AND length('92' || regexp_replace(contact, '^0+', '')) BETWEEN 7 AND 15;

UPDATE parties
SET contact = '92' || regexp_replace(contact, '^0+', '')
WHERE contact ~ '^0'
  AND length('92' || regexp_replace(contact, '^0+', '')) BETWEEN 7 AND 15;

-- ── 3. Verify, then commit ──────────────────────────────────────────────────
-- Expect leftover = 0 on all three. Review the output BEFORE committing.

SELECT 'users'   AS tbl, count(*) FILTER (WHERE contact_number ~ '^0') AS leftover, count(*) AS total FROM users
UNION ALL
SELECT 'stores',        count(*) FILTER (WHERE contact ~ '^0'),               count(*) FROM stores
UNION ALL
SELECT 'parties',       count(*) FILTER (WHERE contact ~ '^0'),               count(*) FROM parties;

COMMIT;
-- ROLLBACK;  -- swap for COMMIT if anything above looked wrong

-- ── 4. Leftovers, for manual review ─────────────────────────────────────────
-- Rows that start with neither a 0 nor a known dial code — a bare local number
-- ("3001234567"), a foreign number, or junk. Too few and too varied to automate;
-- eyeball them. Numbers already starting with a dial code are correct as-is.

SELECT 'users' AS tbl, id, contact_number AS contact FROM users
WHERE contact_number !~ '^(0|92|971|966|974|968|965|973|44|1|61|91|880|86|60)'
UNION ALL
SELECT 'stores', id, contact FROM stores
WHERE contact IS NOT NULL AND contact <> ''
  AND contact !~ '^(0|92|971|966|974|968|965|973|44|1|61|91|880|86|60)'
UNION ALL
SELECT 'parties', id, contact FROM parties
WHERE contact IS NOT NULL AND contact <> ''
  AND contact !~ '^(0|92|971|966|974|968|965|973|44|1|61|91|880|86|60)';
