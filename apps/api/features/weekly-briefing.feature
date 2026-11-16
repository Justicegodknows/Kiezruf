@US-53 @US-56
Feature: Weekly briefing cites its sources

  Scenario: Briefing generated on Monday
    Given it is Monday 06:00 Europe/Berlin
    And "Neukölln" has 61 reports in the last 7 days
    When the briefing job runs for "Neukölln"
    Then the briefing has at most 5 items
    And every item cites at least one report ID from "Neukölln"
    And the briefing is labelled "AI-written"

  Scenario: Item with an invalid citation is dropped
    Given the model returns an item citing "BE-SP-2026-0233"
    When the Neukölln briefing is validated
    Then that item is not stored

  Scenario: Email goes to tenant admins only
    Given "Neukölln" has 1 tenant admin and 3 case workers
    When the briefing is sent at 07:00
    Then exactly 1 email is sent
    And the email contains no photos, names, emails or phone numbers

  Scenario: Comments are pseudonymised before the AI call
    Given a comment says "Call me, Anna, on 0171 1234567"
    When the briefing input is built
    Then the text sent to the provider contains neither "Anna" nor "0171 1234567"
