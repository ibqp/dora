-- Bound the simulated response delay to 0–5000 ms (src/lib/settings/settings.ts). The upper
-- bound keeps every simulated reply far below the 30 s session processing-lock timeout.
-- A value above the bound (only possible through direct database edits) is lowered to it.
UPDATE "AppSettings" SET "mockResponseDelayMs" = 5000 WHERE "mockResponseDelayMs" > 5000;

ALTER TABLE "AppSettings" DROP CONSTRAINT "AppSettings_mockResponseDelayMs_check";
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_mockResponseDelayMs_check"
    CHECK ("mockResponseDelayMs" BETWEEN 0 AND 5000);
