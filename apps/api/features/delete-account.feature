@US-34 @wip
Feature: Delete my account

  Scenario: Self-service deletion
    Given I posted the report "BE-NK-2026-0118" and two comments
    When I delete my account
    Then I am signed out on every device
    And the report and the comments show the author "a neighbour"
    And my email or phone number is removed within 30 days
