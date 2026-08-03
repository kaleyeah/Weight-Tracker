# Compound Fitness — Daily Subjective Ratings

## Role and objective

You are the Lead Engineer for Compound Fitness. Implement a small first version of subjective daily check-in ratings based on the supplied reference screenshot.

This is intentionally a narrow change. Do not redesign the broader check-in, add a wellness engine, introduce new questionnaires, or duplicate information Compound already collects.

## Product decision

Add exactly these four daily ratings:

1. Appetite
2. Recovery
3. Energy
4. Digestion

Use five clearly labeled answer choices for each question. Do not use a numeric 1–10 scale.

### Appetite today

- Too low
- Slightly low
- Just right
- Slightly high
- Too high

### Recovery today

- Very poor
- Poor
- Okay
- Good
- Excellent

### Energy today

- Very low
- Low
- Okay
- Good
- Excellent

### Digestion today

- Significant problems
- Some problems
- Minor problems
- Good
- Excellent

## User experience

- Present each question as one compact row of five tappable choices when space permits.
- Preserve Compound's existing visual system, colors, spacing, typography, accessibility behavior, and responsive conventions. The screenshot is a functional reference, not a request to copy another product's branding.
- Make the selected value unmistakable.
- Make the controls comfortable to tap on a phone.
- On narrower screens, keep the selector usable without clipping or microscopic targets. Follow the app's established responsive pattern.
- A user may change a selection before saving.
- When editing an existing daily check-in, show the previously saved values.

## Scope boundary

Compound already knows or collects the other daily information. Do not add duplicate questions for:

- Date
- Cardio completion
- Weight
- Steps
- Hours of sleep
- Training completion
- Calories or macros

Do not add stress, mood, soreness, pain, illness, medication, GLP-1, travel, contextual-event, or conditional follow-up questions in this iteration.

Do not calculate or display a combined wellness/readiness score. Store and display the four ratings independently.

## Data requirements

- Persist all four values on the applicable athlete/day check-in record.
- Each value must be either `null`/unset or one valid canonical value from its five-option set.
- Use the project's existing naming, storage, synchronization, migration, validation, and conflict-handling conventions.
- Do not invent a parallel storage mechanism.
- Preserve backward compatibility for existing check-in records that do not contain these fields.
- Ensure local-first behavior and existing sync behavior continue to work.

Suggested conceptual field names, only if consistent with the existing model:

- `appetiteRating`
- `recoveryRating`
- `energyRating`
- `digestionRating`

Inspect the codebase before selecting final names. Reuse an existing field if it already represents the exact same concept and scale.

Use stable internal enum values rather than storing the visible label text. The UI labels may change later without requiring a data migration. Choose enum names consistent with the existing codebase and document the mapping.

## Validation and saving

- Accept only the five canonical values defined for the applicable question.
- Follow the current check-in's established required/optional behavior. Do not block saving solely because one of these new ratings is unanswered unless existing product requirements explicitly make daily ratings mandatory.
- Saving, reopening, and editing a check-in must preserve the values correctly.
- Do not silently replace an existing rating with a default.

## Accessibility

- Each option must be keyboard accessible where applicable.
- Expose the group label and selected state to assistive technology.
- Do not rely on color alone to communicate selection.
- Maintain adequate contrast and the app's existing focus treatment.

## Verification

Verify at minimum:

1. A user can select each of the five defined responses for every category.
2. Only one value can be selected per category.
3. A selection can be changed before saving.
4. Values persist after save and reload.
5. Existing records without these values still load.
6. Editing an existing record restores its saved selections.
7. Invalid values are rejected or safely ignored according to existing validation conventions.
8. Mobile layout is usable at the project's smallest supported viewport.
9. Existing check-in functionality and tests remain intact.
10. No duplicate fields were added for data Compound already knows.

Add or update automated tests at the most appropriate existing layer. Run the relevant test and validation commands and report the exact results.

## Required engineer response

Before implementation, briefly report:

- Where the existing daily check-in UI and data model live
- Whether any equivalent fields already exist
- The files you expect to modify
- Any genuine blocker or product decision required

If there is no blocker, proceed with implementation. Afterward provide:

- A concise change summary
- Files changed
- Data-model or migration impact
- Tests and commands run, with results
- Any remaining risks

Do not expand the scope without Product Owner approval.

## Reference

Use `reference-daily-habit-sheet.png` for the intended four-question structure and compact selector pattern. Use the labeled five-choice responses in this document instead of copying the screenshot's numeric 1–10 scale.
