import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ageOnDate } from "../lib/services/student-profile";
import { validateStudentPhotoFile } from "../components/students/student-photo-editor";

test("birth date age is calculated against a civil date without storing age", () => {
  assert.equal(ageOnDate("1990-10-18", "2026-10-18"), 36);
  assert.equal(ageOnDate("1990-10-19", "2026-10-18"), 35);
  assert.equal(ageOnDate(null, "2026-10-18"), null);
  assert.equal(ageOnDate("2027-01-01", "2026-10-18"), null);
});

test("photo selection accepts supported formats and rejects invalid or oversized files", () => {
  assert.equal(validateStudentPhotoFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateStudentPhotoFile({ type: "image/png", size: 1024 }), null);
  assert.equal(validateStudentPhotoFile({ type: "image/webp", size: 1024 }), null);
  assert.match(validateStudentPhotoFile({ type: "image/gif", size: 1024 }) ?? "", /Formato inválido/);
  assert.match(validateStudentPhotoFile({ type: "image/webp", size: 9 * 1024 * 1024 }) ?? "", /8MB/);
});

test("student profile migration is additive and never rewrites operational rows", () => {
  const migration = readFileSync("prisma/migrations/0007_student_profile_photo_birth_date/migration.sql", "utf8");
  assert.match(migration, /ADD COLUMN "dataNascimento" DATE/);
  assert.match(migration, /ADD COLUMN "fotoPath" TEXT/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
});

test("photo editor produces a final WebP and upload route isolates files by student", () => {
  const editor = readFileSync("components/students/student-photo-editor.tsx", "utf8");
  const upload = readFileSync("app/api/alunos/[id]/foto/route.ts", "utf8");
  const serving = readFileSync("app/uploads/students/[studentId]/[fileName]/route.ts", "utf8");
  assert.match(editor, /canvas\.toBlob\(resolve, "image\/webp"/);
  assert.match(editor, /Confirmar foto/);
  assert.match(editor, /Posição horizontal/);
  assert.match(editor, /Zoom/);
  assert.match(editor, /onPointerMove=\{moveDrag\}/);
  assert.match(upload, /getStudentUploadsDirectory\(id\)/);
  assert.match(upload, /randomUUID\(\)/);
  assert.match(serving, /fotoPath: expectedPath/);
});
