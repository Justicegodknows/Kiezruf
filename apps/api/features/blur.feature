@US-31 @US-16
Feature: Nothing is public before it is blurred

  Scenario: Successful blur publishes the report
    Given I posted a report with one photo showing a face and a licence plate
    When photo processing completes
    Then the public photo has the face and the plate blurred
    And the public photo has no EXIF metadata
    And the report is visible on the map

  Scenario: Blur keeps failing
    Given the blur service fails 3 times for my photo
    When photo processing gives up
    Then the report is not visible to citizens
    And the report appears in the moderation queue as "blur failed"
    And the original photo URL is not reachable without a staff session
