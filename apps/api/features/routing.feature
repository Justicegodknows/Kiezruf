@US-03 @US-41 @US-44 @wip
Feature: Route an on-site report to the right office

  Background:
    Given the tenant "Neukölln" has status "pilot"
    And the tenant "Friedrichshain-Kreuzberg" has status "not live"
    And I am signed in as a citizen

  Scenario: Report inside a pilot tenant
    Given my capture location is Karl-Marx-Straße 100 with 20 m accuracy
    When I post a report in category "Pothole"
    Then the report is assigned to tenant "Neukölln"
    And its ID matches "BE-NK-2026-\d{4}"
    And the review screen named "Bezirksamt Neukölln" as the receiving office

  Scenario: Report in an area that is not live
    Given my capture location is inside "Friedrichshain-Kreuzberg"
    When I try to post a report
    Then I see "Kiezruf is not live here yet"
    And no report is created
    And one demand signal is recorded for "Friedrichshain-Kreuzberg"

  Scenario Outline: Location accuracy gate
    Given my capture location has <accuracy> m accuracy
    When I try to post a report
    Then posting is <result>

    Examples:
      | accuracy | result  |
      | 100      | allowed |
      | 101      | blocked |
