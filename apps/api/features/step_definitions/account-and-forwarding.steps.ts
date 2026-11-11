// forward-by-email.feature (US-45) and delete-account.feature (US-34)
import { Given, Then, When } from '@cucumber/cucumber';
import { PENDING } from '../support/world.js';

// --- forward by email ---
Given('{string} is a saved external contact', function (_contact: string) {
  return PENDING;
});

Given('a forward link was created {int} days ago', function (_days: number) {
  return PENDING;
});

When('I forward {string} to {string} with a public note', function (_id: string, _contact: string) {
  return PENDING;
});

When('someone opens the link', function () {
  return PENDING;
});

Then('one email is sent with the blurred photo, the location and a link', function () {
  return PENDING;
});

Then('the link opens the report without a login', function () {
  return PENDING;
});

Then('every follower is notified', function () {
  return PENDING;
});

Then('they see {string}', function (_message: string) {
  return PENDING;
});

// --- delete account ---
Given('I posted the report {string} and two comments', function (_id: string) {
  return PENDING;
});

When('I delete my account', function () {
  return PENDING;
});

Then('I am signed out on every device', function () {
  return PENDING;
});

Then('the report and the comments show the author {string}', function (_author: string) {
  return PENDING;
});

Then('my email or phone number is removed within {int} days', function (_days: number) {
  return PENDING;
});
