// weekly-briefing.feature (US-53, US-56)
import { Given, Then, When } from '@cucumber/cucumber';
import { PENDING } from '../support/world.js';

// A regular expression, because "/" means "or" in Cucumber expressions.
Given(/^it is Monday (\d{2}:\d{2}) Europe\/Berlin$/, function (_time: string) {
  return PENDING;
});

Given('{string} has {int} reports in the last {int} days', function (_tenant: string, _reports: number, _days: number) {
  return PENDING;
});

Given('the model returns an item citing {string}', function (_id: string) {
  return PENDING;
});

Given('{string} has {int} tenant admin and {int} case workers', function (_tenant: string, _admins: number, _workers: number) {
  return PENDING;
});

Given('a comment says {string}', function (_text: string) {
  return PENDING;
});

When('the briefing job runs for {string}', function (_tenant: string) {
  return PENDING;
});

When('the Neukölln briefing is validated', function () {
  return PENDING;
});

When('the briefing is sent at {word}', function (_time: string) {
  return PENDING;
});

When('the briefing input is built', function () {
  return PENDING;
});

Then('the briefing has at most {int} items', function (_max: number) {
  return PENDING;
});

Then('every item cites at least one report ID from {string}', function (_tenant: string) {
  return PENDING;
});

Then('the briefing is labelled {string}', function (_label: string) {
  return PENDING;
});

Then('that item is not stored', function () {
  return PENDING;
});

Then('exactly {int} email is sent', function (_count: number) {
  return PENDING;
});

Then('the email contains no photos, names, emails or phone numbers', function () {
  return PENDING;
});

Then('the text sent to the provider contains neither {string} nor {string}', function (_a: string, _b: string) {
  return PENDING;
});
