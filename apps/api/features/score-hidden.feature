@US-24 @US-22 @wip
Feature: The priority score stays with staff

  # The console scenario "Staff see the breakdown" lives in apps/web/features/score-breakdown.feature.

  Scenario: Citizen API never returns the score
    Given the report "BE-NK-2026-0112" has score 92 and level "Critical"
    When a citizen requests the report
    Then the response has no "score" field
    And the response has no "level" field
