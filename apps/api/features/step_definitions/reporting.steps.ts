// routing.feature (US-03, US-41, US-44) and blur.feature (US-31, US-16)
import { Given, Then, When } from '@cucumber/cucumber';
import { PENDING } from '../support/world.js';

// --- routing ---
Given('my capture location is {word} {int} with {int} m accuracy', function (_street: string, _number: number, _metres: number) {
  return PENDING;
});

Given('my capture location is inside {string}', function (_tenant: string) {
  return PENDING;
});

Given('my capture location has {int} m accuracy', function (_metres: number) {
  return PENDING;
});

When('I post a report in category {string}', function (_category: string) {
  return PENDING;
});

When('I try to post a report', function () {
  return PENDING;
});

Then('the report is assigned to tenant {string}', function (_tenant: string) {
  return PENDING;
});

Then('its ID matches {string}', function (_pattern: string) {
  return PENDING;
});

Then('the review screen named {string} as the receiving office', function (_office: string) {
  return PENDING;
});

Then('no report is created', function () {
  return PENDING;
});

Then('one demand signal is recorded for {string}', function (_tenant: string) {
  return PENDING;
});

Then('posting is {word}', function (_result: string) {
  return PENDING;
});

// --- blur ---
Given('I posted a report with one photo showing a face and a licence plate', function () {
  return PENDING;
});

Given('the blur service fails {int} times for my photo', function (_times: number) {
  return PENDING;
});

When('photo processing completes', function () {
  return PENDING;
});

When('photo processing gives up', function () {
  return PENDING;
});

Then('the public photo has the face and the plate blurred', function () {
  return PENDING;
});

Then('the public photo has no EXIF metadata', function () {
  return PENDING;
});

Then('the report is visible on the map', function () {
  return PENDING;
});

Then('the report is not visible to citizens', function () {
  return PENDING;
});

Then('the report appears in the moderation queue as {string}', function (_reason: string) {
  return PENDING;
});

Then('the original photo URL is not reachable without a staff session', function () {
  return PENDING;
});
