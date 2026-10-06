import assert from "node:assert/strict";
import test from "node:test";
import { historicalDueDate, parseCsv } from "@/lib/import/financial-history-2026";

test("CSV parser preserves quoted commas and BOM headers",()=>{assert.deepEqual(parseCsv('\uFEFFaluno,meses,valor\n"Silva, Ana","Jun, Jul",110.0\n'),[{aluno:"Silva, Ana",meses:"Jun, Jul",valor:"110.0"}]);});
test("historical due date clamps the day without inventing payment dates",()=>{assert.equal(historicalDueDate("2026-02",31),"2026-02-28");assert.equal(historicalDueDate("2026-10",10),"2026-10-10");});
