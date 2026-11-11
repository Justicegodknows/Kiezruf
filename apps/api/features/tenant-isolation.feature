@US-42
Feature: Staff see only their subtree

  Scenario: Case worker in one Bezirk
    Given I am a case worker assigned to "Neukölln"
    And there are open reports in "Neukölln" and "Spandau"
    When I open the priority queue
    Then I see only reports with tenant "Neukölln"

  Scenario: Direct access to another tenant's report
    Given I am a case worker assigned to "Neukölln"
    When I request the Spandau report "BE-SP-2026-0233" by its ID
    Then the response is "404 Not Found"

  Scenario: Viewer at Land level
    Given I am a viewer assigned to "Berlin"
    When I open the priority queue
    Then I see reports from "Neukölln" and "Spandau"
    And I cannot change any report's status
