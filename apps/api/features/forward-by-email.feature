@US-45
Feature: Forward a report by email

  Scenario: Forward to an external contact
    Given I am a case worker assigned to "Spandau"
    And "Verkehrslenkung Berlin" is a saved external contact
    When I forward "BE-SP-2026-0229" to "Verkehrslenkung Berlin" with a public note
    Then one email is sent with the blurred photo, the location and a link
    And the link opens the report without a login
    And the report status is "Forwarded"
    And every follower is notified

  Scenario: Forward link expires
    Given a forward link was created 91 days ago
    When someone opens the link
    Then they see "This link has expired"
