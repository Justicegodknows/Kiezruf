// tenant-isolation.feature (US-42), score-hidden.feature (US-24, US-22), spike-detection.feature (US-26, US-37)
import { Given, Then, When } from '@cucumber/cucumber';
import { PENDING } from '../support/world.js';

// --- tenant isolation ---
Given('there are open reports in {string} and {string}', function (_a: string, _b: string) {
  return PENDING;
});

When('I open the priority queue', function () {
  return PENDING;
});

When('I request the Spandau report {string} by its ID', function (_id: string) {
  return PENDING;
});

Then('I see only reports with tenant {string}', function (_tenant: string) {
  return PENDING;
});

Then('the response is {string}', function (_status: string) {
  return PENDING;
});

Then('I see reports from {string} and {string}', function (_a: string, _b: string) {
  return PENDING;
});

Then("I cannot change any report's status", function () {
  return PENDING;
});

// --- score hidden from citizens ---
Given('the report {string} has score {int} and level {string}', function (_id: string, _score: number, _level: string) {
  return PENDING;
});

When('a citizen requests the report', function () {
  return PENDING;
});

Then('the response has no {string} field', function (_field: string) {
  return PENDING;
});

// --- spike detection ---
Given('a report receives {int} Me too votes within {int} minutes', function (_votes: number, _minutes: number) {
  return PENDING;
});

Given('{int} of those votes come from accounts younger than {int} days', function (_count: number, _days: number) {
  return PENDING;
});

When('the score is recomputed', function () {
  return PENDING;
});

Then('the report is flagged as {string}', function (_flag: string) {
  return PENDING;
});

Then('the {int} new-account votes count at half weight', function (_count: number) {
  return PENDING;
});

Then('the report is not flagged', function () {
  return PENDING;
});
