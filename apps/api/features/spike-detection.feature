@US-26 @US-37 @wip
Feature: Spike detection discounts suspicious votes

  Scenario: Vote spike from new accounts
    Given a report receives 19 Me too votes within 40 minutes
    And 15 of those votes come from accounts younger than 7 days
    When the score is recomputed
    Then the report is flagged as "vote spike"
    And the 15 new-account votes count at half weight

  Scenario: Busy but normal report
    Given a report receives 19 Me too votes within 40 minutes
    And 4 of those votes come from accounts younger than 7 days
    When the score is recomputed
    Then the report is not flagged
