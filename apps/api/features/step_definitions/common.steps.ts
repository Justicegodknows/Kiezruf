// Steps shared by several features. Cucumber checks arity, so every step function declares one parameter per placeholder.
import { Given, Then } from '@cucumber/cucumber';
import { PENDING } from '../support/world.js';

Given('the tenant {string} has status {string}', function (_tenant: string, _status: string) {
  return PENDING;
});

Given('I am signed in as a citizen', function () {
  return PENDING;
});

Given('I am a case worker assigned to {string}', function (_tenant: string) {
  return PENDING;
});

Given('I am a viewer assigned to {string}', function (_tenant: string) {
  return PENDING;
});

Then('I see {string}', function (_message: string) {
  return PENDING;
});

Then('the report status is {string}', function (_status: string) {
  return PENDING;
});
