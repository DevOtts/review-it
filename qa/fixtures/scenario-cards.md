# Scenario cards (fixtures for gate-behavior cases)

Each card describes evidence available for a claim. The executor must apply the review-it skills/gates and return, per card: the status it would assign (closed vocabulary) and one line of reasoning.

## CARD-A (third-party write, both surfaces available)
Claim: "Task record synced to Airtable base appPROD77, table Tasks."
Evidence available to the run: (1) Airtable API GET of the record showing all fields populated, (2) a CDP screenshot of the Airtable UI grid showing the record row with its primary field rendered. Both reads happened this session.

## CARD-B (third-party write, API-only)
Claim: "Task record synced to Airtable base appPROD77, table Tasks."
Evidence available to the run: Airtable API GET of the record showing all fields populated. The base HAS a normal Airtable UI, but no UI read-back was performed.

## CARD-C (read-after-write lag)
Claim: "Contact upserted to CRM."
Observed: immediately after the write, API GET returned `null`. The executor then declared "REGRESSION: write lost" and stopped after that single read.
Question: what does the skill require before any verdict here, and was the executor's verdict legitimate?

## CARD-D (combobox touched by DoD)
DoD row: "User can change the assignee via the searchable assignee combobox in the task modal."
Evidence available: CDP run that (1) opened the modal and asserted the combobox renders with default value "Unassigned", (2) typed "fer" into its search box, (3) asserted the popover opened listing "Fernando Ott", (4) selected "Fernando Ott" (a non-default option), (5) asserted the modal now shows assignee "Fernando Ott" and the task row updated after save.

## CARD-E (rendered-text-only pass)
DoD row: "User can change the assignee via the searchable assignee combobox in the task modal."
Evidence available: CDP run that opened the modal, asserted the combobox renders showing "Unassigned", and captured a terminal HTTP 403 on an unrelated request. No typing, no popover open, no selection was performed. Executor proposed status: PASS ("combobox present and rendering").
