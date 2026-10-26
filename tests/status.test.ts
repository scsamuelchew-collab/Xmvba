import assert from "node:assert/strict";
import { test } from "node:test";
import { canRequestToJoin, canSubmit, currentStage, isWaitlistTeam, matchScore, slotSummary, teamStatusLabel } from "../src/lib/status.ts";

const settings = { open_slots: 2, min_roster: 10, max_roster: 12, registration_open: true, fee_cents: 0 };
const team = (over: Record<string, unknown> = {}) => ({
  status: "forming" as const,
  member_count: 5,
  recruiting: true,
  is_reserved: false,
  submitted_at: null,
  roster_locked: false,
  ...over,
}) as Parameters<typeof teamStatusLabel>[0];

test("slots: only confirmed non-reserved teams use open slots", () => {
  const s = slotSummary(settings, [
    team({ status: "confirmed" }),
    team({ status: "confirmed", is_reserved: true }),
    team({ status: "admin_review" }),
  ]);
  assert.deepEqual(s, { open: 2, used: 1, remaining: 1, full: false });
  const full = slotSummary(settings, [team({ status: "confirmed" }), team({ status: "confirmed" })]);
  assert.equal(full.remaining, 0);
  assert.equal(full.full, true);
});

test("status labels follow roster size and stage", () => {
  assert.equal(teamStatusLabel(team(), settings).label, "Looking for Players");
  assert.equal(teamStatusLabel(team({ member_count: 10 }), settings).label, "Minimum Reached");
  assert.equal(teamStatusLabel(team({ member_count: 12 }), settings).label, "Full");
  assert.equal(teamStatusLabel(team({ recruiting: false }), settings).label, "Not Recruiting");
  assert.equal(teamStatusLabel(team(), { ...settings, registration_open: false }).label, "Registration Closed");
  assert.equal(teamStatusLabel(team({ status: "admin_review" }), settings).label, "Pending Admin Approval");
  assert.equal(teamStatusLabel(team({ status: "confirmed" }), settings).label, "Confirmed");
});

test("waitlist: forming teams become waitlist teams once slots are full, reserved team excepted", () => {
  const full = { open: 2, used: 2, remaining: 0, full: true };
  const open = { open: 2, used: 1, remaining: 1, full: false };
  assert.equal(isWaitlistTeam(team(), full), true);
  assert.equal(isWaitlistTeam(team(), open), false);
  assert.equal(isWaitlistTeam(team({ is_reserved: true }), full), false);
  assert.equal(isWaitlistTeam(team({ status: "confirmed" }), full), false);
  assert.equal(isWaitlistTeam(team({ status: "waitlist" }), open), true);
});

test("stages", () => {
  assert.equal(currentStage(team(), settings), 0);
  assert.equal(currentStage(team({ member_count: 10 }), settings), 1);
  assert.equal(currentStage(team({ status: "waitlist", submitted_at: "x" }), settings), 2);
  assert.equal(currentStage(team({ status: "payment_pending" }), settings), 3);
  assert.equal(currentStage(team({ status: "admin_review" }), settings), 4);
  assert.equal(currentStage(team({ status: "confirmed" }), settings), 5);
});

test("join and submit eligibility", () => {
  assert.equal(canRequestToJoin(team(), settings).ok, true);
  assert.equal(canRequestToJoin(team({ member_count: 12 }), settings).reason, "Team full");
  assert.equal(canRequestToJoin(team({ roster_locked: true }), settings).reason, "Roster locked");
  assert.equal(canSubmit(team({ member_count: 9 }), settings).ok, false);
  assert.equal(canSubmit(team({ member_count: 10 }), settings).ok, true);
  assert.equal(canSubmit(team({ member_count: 10, status: "admin_review" }), settings).ok, false);
});

test("position matching ranks primary over secondary over flexible", () => {
  const needs = { setter: 1, utility: 1 };
  assert.equal(matchScore(needs, { primary_position: "setter", secondary_position: null }), 3);
  assert.equal(matchScore(needs, { primary_position: "libero", secondary_position: "setter" }), 2);
  assert.equal(matchScore(needs, { primary_position: "libero", secondary_position: null }), 1);
  assert.equal(matchScore({}, { primary_position: "libero", secondary_position: null }), 0);
});
