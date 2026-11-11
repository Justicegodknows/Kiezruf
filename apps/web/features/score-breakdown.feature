@US-24 @US-22 @wip
Feature: The priority score stays with staff

  # From the engineering plan. The citizen API scenario lives in apps/api/features/score-hidden.feature.

  Scenario: Staff see the breakdown
    Given I am a case worker assigned to "Neukölln"
    When I open "BE-NK-2026-0112" in the console
    Then I see the base points, decay, danger and safety multipliers
    And their product equals the shown score
