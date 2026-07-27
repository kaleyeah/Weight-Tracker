# Max Rogers Fitness Knowledge Codex
## Search-ready doctrine, implementation schema, and indexed source catalog

**Channel:** Max Rogers / `@maxinomuscle`  
**Channel focus:** Sustainable fat loss, muscle growth, body recomposition, maintenance, reverse dieting, and simplified training systems for busy men.  
**Codex version:** 0.1 — initial research build  
**Last researched:** 2026-07-25  
**Intended use:** Claude-powered mobile/desktop reference dashboard with full-text search, topic filters, source-video traceability, and daily incremental updates.

> [!IMPORTANT]
> This initial build synthesizes the channel's discoverable long-form videos, indexed titles, descriptions, search excerpts, and recurring themes. The channel contains roughly 470+ videos. YouTube did not expose every transcript through the research interface, so entries are labeled by evidence depth. Do not present an inferred recommendation as a verbatim statement by Max Rogers.

---

# 1. How to Use This Codex

Use the doctrine pages for fast answers. Use the source catalog to trace an answer back to one or more videos.

Recommended dashboard behavior:

- Search across titles, summaries, tags, principles, prescriptions, and transcript notes.
- Filter by topic, body-fat phase, goal, evidence depth, publication date, and content type.
- Show a concise answer first, then expandable source evidence.
- Clearly separate:
  - **Directly stated**
  - **Strong recurring synthesis**
  - **Inferred implementation**
  - **External scientific verification**
- Never silently merge Max Rogers' coaching philosophy with general fitness science.
- When multiple videos cover the same subject, prioritize the newest complete explanation while preserving older versions for change tracking.

---

# 2. Evidence Labels

| Label | Meaning |
|---|---|
| `DIRECT` | Supported by a visible title, description, chapter, transcript excerpt, or explicit statement. |
| `RECURRING` | Appears consistently across multiple Max Rogers videos and channel themes. |
| `INFERRED` | Practical conclusion derived from the recurring framework but not confirmed as an exact quote. |
| `NEEDS_TRANSCRIPT` | Video is relevant, but the complete prescription should be extracted from its transcript before being treated as authoritative. |
| `VERIFY_EXTERNALLY` | Health, physiology, or safety claim should be compared with primary scientific or medical sources. |

---

# 3. Core Philosophy

## 3.1 The Main Objective

Max Rogers' central objective is not merely to lose scale weight. It is to build a lean, muscular physique that can be maintained without cycling repeatedly between aggressive dieting and rebound weight gain.

**Core sequence:**

1. Establish accurate current intake and body-weight trends.
2. Create a controlled calorie deficit.
3. Keep protein high.
4. Strength train consistently and preserve performance.
5. Use daily movement and cardio strategically.
6. Adjust from trend data rather than emotion.
7. End the cut deliberately.
8. Rebuild maintenance calories through a structured post-diet phase.
9. Remain at maintenance long enough to normalize behavior and performance.
10. Enter a lean-gaining phase only when body fat and habits are under control.

**Evidence:** `RECURRING`

## 3.2 Simplicity Over Novelty

The channel repeatedly frames successful physique change as the result of simple systems executed for long enough, not secret exercises, metabolic hacks, or constant program changes.

Typical priorities:

- Calorie control
- Adequate protein
- Progressive resistance training
- Steps or daily activity
- Sleep and recovery
- Consistent tracking
- Appropriate phase selection

**Evidence:** `RECURRING`

## 3.3 Fat Loss Is a Phase, Not a Permanent Lifestyle

A calorie deficit is a temporary intervention. Remaining in a prolonged deficit without a planned exit can create fatigue, lower training quality, hunger, reduced spontaneous movement, poor adherence, and rebound eating.

The endpoint of a cut should therefore include a maintenance or reverse-diet strategy rather than an immediate return to untracked eating.

**Evidence:** `DIRECT` / `RECURRING`  
**Primary sources:**  
- “This is Why You Need To Reverse Diet After Losing Body Fat”  
- “If You Always Lose Fat & Gain It Back… Watch This”  
- “How To Get Lean & STAY Lean Forever (Using Science)”

## 3.4 Getting Lean and Staying Lean Are Different Skills

Getting lean requires executing a deficit. Staying lean requires:

- A sustainable maintenance intake
- Stable routines
- Resistance training
- Awareness of body-weight trends
- Controlled flexibility
- Early correction before a small regain becomes a large regain

**Evidence:** `RECURRING`

---

# 4. The Max Rogers Phase Model

## Phase 0 — Assessment and Calibration

### Purpose
Determine whether the person should cut, maintain, recomp, or lean gain.

### Inputs
- Average morning body weight
- Estimated body-fat range
- Waist measurement
- Training age
- Current calories
- Protein intake
- Step count
- Training frequency and performance
- Recent dieting history
- Hunger, sleep, and adherence
- Whether the person is “skinny fat,” overweight, already lean, or under-muscled

### Likely recommendation pattern
- Higher body fat: prioritize fat loss.
- Moderate body fat with low muscularity: cut or recomp depending on training status and adherence.
- Lean and under-muscled: controlled lean gain.
- Recently dieted and fatigued: maintenance or reverse diet before another cut.
- Chronically inconsistent: stabilize habits before using an aggressive target.

**Evidence:** `RECURRING` / `INFERRED`

---

## Phase 1 — Fat-Loss Setup

### Objective
Lose fat at a rate that preserves muscle and can be adhered to.

### Core components
- Establish a measurable calorie deficit.
- Set protein high enough to protect lean mass and improve satiety.
- Keep resistance training as the primary muscle-retention signal.
- Use steps as a low-fatigue activity tool.
- Add cardio only as needed.
- Track average weight rather than reacting to daily fluctuations.
- Adjust calories or activity only after enough trend data.

**Evidence:** `RECURRING`

### Dashboard decision card

```yaml
phase: fat_loss
goal: reduce_body_fat
primary_levers:
  - calorie_deficit
  - protein
  - resistance_training
  - steps
secondary_levers:
  - cardio
  - meal_timing
  - food_volume
avoid:
  - daily_scale_reactions
  - unplanned_cheat_days
  - excessive_program_changes
  - cutting_calories_without_data
```

---

## Phase 2 — Active Cutting

### What to monitor
- 7-day average body weight
- Waist trend
- Gym performance
- Hunger
- Sleep
- Step compliance
- Calorie and protein compliance
- Visual progress
- Diet duration

### Adjustment logic
A plateau is not one unchanged weigh-in. It is a sustained lack of trend change while adherence is confirmed.

Before cutting calories:

1. Verify food tracking.
2. Verify weekend intake.
3. Verify average steps.
4. Check sodium, carbohydrate, bowel, and water fluctuations.
5. Check whether training inflammation is masking loss.
6. Confirm the plateau has lasted long enough to be meaningful.
7. Make one small adjustment.
8. Observe before adjusting again.

**Evidence:** `RECURRING` / `INFERRED`

---

## Phase 3 — The Leaner Stages

The channel frequently divides the journey by approximate male body-fat ranges, especially the transition from roughly 20% toward 12% or 10%.

### Around 20%+
Primary challenge:
- Building basic adherence
- Correctly estimating the amount of fat that must be lost
- Avoiding unrealistic timelines
- Creating repeatable meals and movement

### Around 16–18%
Primary challenge:
- Progress becomes less visually dramatic.
- Calorie errors matter more.
- Diet fatigue and impatience increase.
- The person may believe metabolism is “broken.”
- Consistency on weekends becomes decisive.

### Around 12–15%
Primary challenge:
- The margin for error narrows.
- Hunger and fatigue may rise.
- Muscle definition improves, but expectations may outpace actual fat loss.
- Training performance and recovery require closer management.
- A person may need more time than predicted because body-fat estimates are imprecise.

### Around 10–12%
Primary challenge:
- The physique is difficult for many people to maintain casually.
- The additional visual payoff may not justify the increased restriction.
- A sustainable endpoint may be closer to 12% than a true 10%.
- The exit strategy becomes as important as the final weeks of the cut.

**Evidence:** `DIRECT` / `RECURRING`

Relevant videos:
- “Why Most Guys FAIL Going From 20% to 10% Body Fat”
- “This Is Why You Can't Reach 12% Body Fat (And How To Do It)”
- “Stuck at 20% Body Fat? Here's How to Finally Get Ripped”
- “95% of Men NEVER Get Past This Stage of Fat Loss”
- “Why You're Stuck at 18-20% Body Fat (And Can't Get Leaner)”
- “Why Everything Changes Under 20% Body Fat”
- “Why 12% Body Fat Is the Perfect Physique”
- “How to Go from 20% to 10% Body Fat”
- “30% to 12% Body Fat | Timeline Explained”

---

## Phase 4 — Ending the Cut

### Signals that a cut may need to end
- Goal body-fat range reached
- Diet fatigue is high
- Training performance has materially degraded
- Hunger is persistently intrusive
- Adherence is deteriorating
- The person has dieted for an extended period
- The marginal benefit of more loss is small
- The person is becoming overly focused on achieving an arbitrary number

### Transition priorities
- Do not celebrate by abandoning structure.
- Define an initial maintenance target.
- Continue weighing and tracking.
- Keep protein and resistance training stable.
- Reduce unnecessary cardio gradually if it was added for the cut.
- Expect some scale increase from glycogen, food volume, and water.
- Distinguish normal post-diet scale restoration from rapid fat regain.

**Evidence:** `RECURRING`

---

## Phase 5 — Reverse Diet or Maintenance Restoration

### Central thesis
A post-diet transition is needed because the habits, intake, activity, and fatigue state used to become lean are not necessarily appropriate for long-term maintenance.

### Likely reverse-diet framework
- Increase calories in controlled increments.
- Watch average body weight and waist.
- Maintain protein.
- Prioritize added carbohydrates where useful for performance and recovery.
- Reduce cardio deliberately rather than stopping all activity at once.
- Continue lifting.
- Find the highest maintainable intake that keeps weight relatively stable.
- Accept a modest increase in scale weight from restored glycogen and food volume.
- Avoid interpreting every scale increase as fat gain.

### Important nuance
A reverse diet is not magic metabolic repair. Its practical value is behavioral control, structured calorie restoration, better training, and discovering maintenance without a rebound.

**Evidence:** `DIRECT` / `RECURRING`  
**Primary source:** “This is Why You Need To Reverse Diet After Losing Body Fat”

---

## Phase 6 — Maintenance

### Purpose
Consolidate the result and practice the behaviors required to remain lean.

### Maintenance behaviors
- Continue resistance training.
- Maintain a protein floor.
- Keep a consistent daily movement baseline.
- Use average weight and waist as guardrails.
- Allow flexibility inside an overall calorie structure.
- Correct small deviations early.
- Spend enough time at maintenance to reduce diet fatigue before another aggressive phase.

### Maintenance range concept
Maintenance should usually be treated as a range rather than a single exact scale number.

**Evidence:** `RECURRING` / `INFERRED`

---

## Phase 7 — Lean Gaining

### Objective
Gain muscle while minimizing unnecessary fat gain.

### Framework
- Start lean enough that a calorie surplus is appropriate.
- Use a small surplus rather than an uncontrolled bulk.
- Progress training.
- Track body-weight rate and waist.
- Keep protein adequate.
- Increase calories only when progress requires it.
- Use mini-cuts if body fat rises beyond the chosen guardrail.
- Judge success by strength, measurements, photos, and performance—not weight alone.

**Evidence:** `DIRECT` / `RECURRING`  
**Primary source:** “The Ultimate Lean Bulking Guide / Gain Muscle Without Fat”

---

# 5. Nutrition Doctrine

## 5.1 Calories

Calories determine whether body mass is generally trending down, stable, or up. The channel frequently addresses people who report eating very low calories without losing weight, usually by examining tracking accuracy, adaptation, activity, and the difference between claimed intake and average intake.

### Implementation
- Use actual logged intake.
- Include oils, drinks, bites, sauces, and weekend meals.
- Compare intake with 7-day weight trends.
- Avoid assuming an equation is more accurate than real-world trend data.
- Adjust based on observed response.

**Evidence:** `DIRECT` / `RECURRING`  
**Source:** “Eating Low Calories And Still Not Losing Weight? Here's Why”

## 5.2 Protein

Protein is treated as a major tool for:

- Preserving muscle during fat loss
- Supporting muscle growth
- Improving fullness
- Increasing meal structure
- Improving recovery

### Implementation principles
- Set a daily protein target.
- Distribute protein across several meals.
- Use high-protein meals to make calorie control easier.
- Do not let protein displace all dietary fat, carbohydrate, fiber, and micronutrient needs.

**Evidence:** `DIRECT` / `RECURRING`  
**Sources:**  
- “Protein and Fat Loss / Everything you Need to Know”  
- “The Protein Expert: Fat Loss Gets EASIER When You Understand This”  
- “4 Simple High Protein Breakfast Ideas”

## 5.3 Carbohydrates

Carbohydrates are generally useful for:

- Resistance-training performance
- Recovery
- Adherence
- Restoring calories after a cut
- Supporting higher training volume

Carbohydrates are not inherently fattening. Their effect depends on total energy balance and the structure of the diet.

**Evidence:** `RECURRING` / `INFERRED`

## 5.4 Dietary Fat

Dietary fat should not be driven excessively low. It contributes to food quality, palatability, essential fatty acid intake, and a sustainable diet.

**Evidence:** `RECURRING` / `VERIFY_EXTERNALLY`

## 5.5 Meal Structure

A practical fat-loss meal generally combines:

- A meaningful protein serving
- High-volume produce
- A controlled carbohydrate source
- A measured fat source
- Foods that are easy to track and repeat

**Evidence:** `RECURRING` / `INFERRED`

## 5.6 Alcohol

Alcohol can be included while losing fat, but it consumes calories, reduces dietary control, can worsen sleep, and often leads to secondary overeating.

### Practical hierarchy
1. Budget the calories.
2. Avoid treating alcohol as “free.”
3. Maintain protein.
4. Prefer lower-calorie choices.
5. Plan food before drinking.
6. Avoid using exercise to compensate.
7. Understand that poor sleep and lowered inhibition may matter more than the drink calories alone.

**Evidence:** `DIRECT` / `INFERRED`  
**Source:** “How to Drink Alcohol and STILL Lose Fat”

---

# 6. Training Doctrine

## 6.1 Primary Role of Resistance Training

During fat loss, lifting is not mainly a calorie-burning tool. It is the signal to retain muscle.

During maintenance or gaining, lifting provides the stimulus for muscular development.

**Evidence:** `RECURRING`

## 6.2 Three-Day Training

The channel has a dedicated full program for a three-day split, supporting the broader idea that effective muscle growth does not require training every day.

### Likely principles
- Train major muscle groups more than once per week where possible.
- Use a manageable number of high-quality working sets.
- Center the plan on repeatable compound and isolation movements.
- Progress reps or load over time.
- Allow recovery between sessions.
- Avoid junk volume.

**Evidence:** `DIRECT` / `NEEDS_TRANSCRIPT`  
**Source:** “The Best 3-Day Workout Split for Muscle Growth (Full Program)”

## 6.3 Progressive Overload

Track performance and seek gradual improvement through one or more of:

- More reps with the same load
- More load with similar reps
- Better technique
- Greater range of motion
- More controlled execution
- More productive sets at a stable effort level

**Evidence:** `RECURRING` / `INFERRED`

## 6.4 Training Effort

Productive sets must be sufficiently hard, but constantly adding volume or training recklessly is not the goal.

The practical dashboard should track:

- Exercise
- Load
- Reps
- Estimated reps in reserve
- Technique quality
- Pain
- Session performance
- Recovery

**Evidence:** `INFERRED`

## 6.5 Exercise Selection

Choose movements that:

- Train the target muscle effectively
- Can be progressed
- Fit the person's structure and equipment
- Do not create unnecessary pain
- Can be repeated consistently enough to measure improvement

**Evidence:** `RECURRING` / `INFERRED`

---

# 7. Steps, Cardio, and Energy Expenditure

## 7.1 Steps as a Foundational Tool

The channel explicitly argues that steps can outperform excessive formal cardio for fat loss because walking:

- Adds energy expenditure with low fatigue
- Is recoverable
- Can be distributed throughout the day
- Is less likely to interfere with lifting
- Helps preserve a stable daily activity baseline

**Evidence:** `DIRECT`  
**Source:** “The steps you do, burn fat and get you leaner faster.... but why?”

## 7.2 Cardio as a Strategic Lever

Cardio is useful, but it should support the fat-loss plan rather than replace nutrition or compromise resistance training.

Use cardio to:

- Improve health and fitness
- Create additional expenditure
- Preserve food intake when a larger deficit is needed
- Break a plateau after adherence is confirmed

Avoid:
- Adding large amounts immediately
- Treating cardio calories as exact
- Using cardio as punishment
- Allowing cardio to reduce leg-training quality or recovery

**Evidence:** `RECURRING` / `INFERRED`

## 7.3 Doing Less Can Produce Better Results

Some channel content frames “doing less” as superior when the alternative is excessive training, excessive cardio, poor recovery, or an unsustainable plan.

This does not mean inactivity. It means using the minimum effective dose that can be progressed and sustained.

**Evidence:** `RECURRING`

---

# 8. Body Recomposition

## Definition
Losing fat while gaining muscle in the same general period.

## Best candidates
- Beginners
- People returning after a layoff
- Higher-body-fat trainees
- People whose training and protein were previously inadequate
- Individuals using a moderate deficit and strong resistance-training plan

## Less favorable candidates
- Advanced, already-lean lifters
- People using an aggressive deficit
- People with inconsistent protein or training
- People expecting rapid scale loss and rapid muscle gain simultaneously

## Dashboard interpretation
A successful recomp may show:

- Slow scale change
- Declining waist
- Improved photos
- Increased strength or reps
- Better muscle measurements
- Improved fit of clothing

**Evidence:** `DIRECT` / `RECURRING`  
**Sources:**  
- “How To Build Muscle And Lose Fat At The Same Time: Step by Step”  
- “The Exact System To Build Muscle And Lose Fat At The Same Time”

---

# 9. Skinny-Fat Framework

The “skinny fat” problem is typically a combination of insufficient muscular development and enough body fat to hide definition.

### Decision logic
- If body fat is meaningfully elevated, cut while lifting and eating high protein.
- If already relatively lean but under-muscled, use a controlled gaining phase.
- Do not solve the problem with endless cardio.
- Do not aggressively bulk when already uncomfortable with body fat.
- Evaluate waist, muscularity, and training age rather than scale weight alone.

**Evidence:** `DIRECT` / `RECURRING`  
**Source:** “What Everyone Gets Wrong About Skinny Fat”

---

# 10. Plateaus and Metabolic Adaptation

## What a plateau can mean
- Tracking drift
- Lower daily movement
- Reduced body mass and energy needs
- Water retention
- Inconsistent weekends
- Diet fatigue
- Smaller true deficit than expected
- Normal short-term noise

## What it does not automatically mean
- A permanently damaged metabolism
- The need for a crash diet
- The need to abandon resistance training
- Proof that calories no longer matter

## Response sequence
1. Confirm the plateau.
2. Audit adherence.
3. Audit steps.
4. Review sleep and stress.
5. Compare waist and photos.
6. Make a modest change.
7. Reassess after a defined period.

**Evidence:** `DIRECT` / `RECURRING`  
**Sources:**  
- “Eating Low Calories And Still Not Losing Weight? Here's Why”  
- “How to Increase your Metabolism for Faster Fat Loss”  
- “Why You're Stuck at 18-20% Body Fat”

---

# 11. Sustainability and Rebound Prevention

## Common rebound causes
- Ending a diet without a transition
- Treating the goal weight as permission to stop all structure
- Excessive restriction during the cut
- Losing faster than habits can adapt
- Removing cardio while simultaneously increasing food dramatically
- Abandoning weigh-ins
- Not knowing maintenance calories
- Returning to the environment and behaviors that caused the gain
- Attempting to maintain a body-fat level that is too demanding

## Prevention system
- Decide the post-cut plan before the final week.
- Keep tracking during the transition.
- Establish an acceptable maintenance range.
- Continue lifting and steps.
- Increase calories deliberately.
- Expect normal scale restoration.
- Use early-intervention thresholds.
- Schedule a maintenance phase before another cut.

**Evidence:** `DIRECT` / `RECURRING`

---

# 12. Common Myths the Channel Pushes Against

| Myth | Codex synthesis |
|---|---|
| “I need a perfect diet.” | A repeatable calorie and protein structure matters more than perfection. |
| “More cardio is always better.” | Excessive cardio can reduce recovery and adherence; steps are often a better first lever. |
| “My metabolism is broken.” | Adaptation and lower expenditure occur, but plateaus usually require a data and adherence audit. |
| “Carbs prevent fat loss.” | Total energy balance is the primary driver; carbs can support training. |
| “I need six gym days.” | A well-built three-day plan can produce substantial progress. |
| “Once I reach the goal, I can stop tracking.” | The transition and maintenance phase determine whether the result lasts. |
| “A bulk should be fast.” | A small controlled surplus is more consistent with lean gaining. |
| “Scale weight tells the whole story.” | Waist, photos, performance, and trend averages matter. |
| “10% body fat is automatically the best goal.” | The effort and maintainability must be weighed against the visual benefit. |
| “One bad day ruined the diet.” | Weekly patterns and rapid return to routine matter more. |

---

# 13. Dashboard Answer Templates

## 13.1 “What phase should I be in?”

```markdown
### Recommended phase
[Fat loss / maintenance / reverse diet / recomp / lean gain]

### Why
- Current body-fat range:
- Recent dieting history:
- Training status:
- Adherence:
- Recovery:

### Primary targets
- Calories:
- Protein:
- Steps:
- Training:
- Cardio:

### Reassessment date
[date]

### Source doctrine
[list linked codex entries]
```

## 13.2 “Why did my weight stop dropping?”

```markdown
### Most likely explanations
1.
2.
3.

### Before changing calories
- Confirm 7-day average
- Audit weekend intake
- Verify steps
- Check sodium/carbohydrate changes
- Review bowel regularity
- Check training inflammation
- Compare waist and photos

### Adjustment
Make one change only, then observe for a defined period.
```

## 13.3 “How do I end my cut?”

```markdown
### Exit plan
- Set initial maintenance calories
- Maintain protein
- Continue lifting
- Keep steps stable
- Reduce cardio gradually
- Increase calories in controlled increments
- Expect glycogen/water restoration
- Track average weight and waist

### Guardrail
A rapid sustained increase beyond the maintenance range triggers review.
```

---

# 14. Search Taxonomy

## Primary topics

```yaml
topics:
  - fat_loss
  - body_fat_percentage
  - calorie_deficit
  - metabolism
  - plateau
  - protein
  - carbohydrates
  - dietary_fat
  - meal_planning
  - alcohol
  - body_recomposition
  - skinny_fat
  - muscle_growth
  - strength_training
  - workout_split
  - progressive_overload
  - steps
  - cardio
  - reverse_diet
  - maintenance
  - rebound_prevention
  - lean_bulk
  - adherence
  - sleep
  - stress
  - men_over_40
```

## Goal tags

```yaml
goals:
  - lose_10_lb
  - lose_20_lb
  - lose_40_lb
  - reach_20_percent
  - reach_15_percent
  - reach_12_percent
  - reach_10_percent
  - preserve_muscle
  - gain_muscle
  - stay_lean
  - improve_metabolism
  - stop_rebounding
```

## Audience tags

```yaml
audiences:
  - beginner
  - intermediate
  - advanced
  - busy_professional
  - men_over_40
  - skinny_fat
  - overweight
  - post_diet
  - plateaued
```

---

# 15. Recommended Data Model

## Video record

```yaml
id: youtube_video_id
title: string
url: string
published_at: YYYY-MM-DD
duration_seconds: integer|null
content_type: long_form|short|podcast|client_case_study|recipe|workout
status: indexed|transcript_pending|summarized|verified
evidence_depth: title_only|description|chapters|partial_transcript|full_transcript
summary: string
core_thesis: string
action_items:
  - string
numeric_targets:
  - metric: string
    value: string
    context: string
claims:
  - text: string
    evidence_label: DIRECT|RECURRING|INFERRED|VERIFY_EXTERNALLY
topics:
  - string
body_fat_ranges:
  - string
phases:
  - assessment|fat_loss|reverse_diet|maintenance|lean_gain
contradicts:
  - video_id
supersedes:
  - video_id
related_videos:
  - video_id
transcript_path: string|null
last_reviewed_at: YYYY-MM-DD
```

## Doctrine record

```yaml
id: doctrine_slug
title: string
short_answer: string
full_answer: string
prescription:
  - string
exceptions:
  - string
evidence_label: DIRECT|RECURRING|INFERRED|VERIFY_EXTERNALLY
source_video_ids:
  - string
external_verification:
  status: unreviewed|supported|mixed|unsupported
  sources:
    - string
last_updated_at: YYYY-MM-DD
```

---

# 16. Indexed Source Catalog

The following videos were discoverable during the initial research pass. Entries marked `NEEDS_TRANSCRIPT` should be enriched by transcript ingestion.

## Fat loss, body-fat stages, and timelines

### If You Always Lose Fat & Gain It Back… Watch This
- **URL:** https://www.youtube.com/watch?v=TN_utYhibPU
- **Topics:** rebound prevention, maintenance, reverse dieting
- **Likely thesis:** Repeated regain is usually caused by an incomplete post-diet system, not an inability to lose weight.
- **Evidence depth:** indexed excerpt
- **Status:** `NEEDS_TRANSCRIPT`

### How To Get Lean & STAY Lean Forever (Using Science)
- **URL:** https://www.youtube.com/watch?v=roHQ3F7d9YQ
- **Topics:** sustainable fat loss, maintenance
- **Direct description:** Covers three strategies for making long-term fat loss more sustainable and maintaining a new weight.
- **Evidence depth:** description
- **Status:** summarized

### This Is Why You Can't Reach 12% Body Fat (And How To Do It)
- **URL:** https://www.youtube.com/watch?v=lkXdTGugZa0
- **Topics:** 12% body fat, plateau, advanced cutting
- **Status:** `NEEDS_TRANSCRIPT`

### Stuck at 20% Body Fat? Here's How to Finally Get Ripped
- **URL:** https://www.youtube.com/watch?v=UdoEgAQnPRk
- **Topics:** 20% body fat, fat-loss setup
- **Status:** `NEEDS_TRANSCRIPT`

### 95% of Men NEVER Get Past This Stage of Fat Loss
- **URL:** https://www.youtube.com/watch?v=Wfn2LdaRybE
- **Topics:** plateau, intermediate body-fat stage
- **Indexed recency:** approximately three weeks before the research date
- **Status:** `NEEDS_TRANSCRIPT`

### If You Want To Get Lean, You Need To Lose Way More Fat Than You Think
- **URL:** https://www.youtube.com/watch?v=FhsPcti3ttw
- **Topics:** realistic expectations, body-fat estimation
- **Status:** `NEEDS_TRANSCRIPT`

### How Long To Lose 10% Body Fat | Calories and Cardio Explained
- **URL:** https://www.youtube.com/watch?v=Gfj-g0DQaL4
- **Topics:** timelines, calories, cardio
- **Status:** `NEEDS_TRANSCRIPT`

### Getting Lean is Actually Really Simple. Just Do This
- **URL:** https://www.youtube.com/watch?v=aq0eboGomgE
- **Topics:** simplified fat-loss system
- **Status:** `NEEDS_TRANSCRIPT`

### 30% to 12% Body Fat | Timeline Explained
- **URL:** https://www.youtube.com/watch?v=qgmw1xmMmQg
- **Topics:** high body fat, timeline, phases
- **Status:** `NEEDS_TRANSCRIPT`

### How to Drop Body Fat Forever (10 Step Blueprint)
- **URL:** https://www.youtube.com/watch?v=Luni64eCEL8
- **Topics:** sustainable fat loss, blueprint
- **Status:** `NEEDS_TRANSCRIPT`

### If I Wanted to Go From 30% Body Fat to 10%, This Is What I'd Do
- **URL:** https://www.youtube.com/watch?v=RnySlXhGpwc
- **Topics:** long-term transformation, phase planning
- **Status:** `NEEDS_TRANSCRIPT`

### Why You're Stuck at 18-20% Body Fat (And Can't Get Leaner)
- **URL:** https://www.youtube.com/watch?v=tEPcu0rcJDA
- **Topics:** plateau, 18–20% body fat
- **Status:** `NEEDS_TRANSCRIPT`

### Why Everything Changes Under 20% Body Fat
- **URL:** https://www.youtube.com/watch?v=Ni9S6DlzFCA
- **Topics:** body-fat stages
- **Status:** `NEEDS_TRANSCRIPT`

### Why 90% of People NEVER Lose Their Stubborn Body Fat
- **URL:** https://www.youtube.com/watch?v=RZtXPlOAFTM
- **Topics:** stubborn fat, adherence, plateau
- **Status:** `NEEDS_TRANSCRIPT`

### Why Some Men Stay Lean Forever (And Others Rebound)
- **URL:** https://www.youtube.com/watch?v=GHLY2GWKdic
- **Topics:** maintenance, rebound prevention
- **Status:** `NEEDS_TRANSCRIPT`

### How to Go from 20% to 10% Body Fat
- **URL:** https://www.youtube.com/watch?v=xUKW0ycptRw
- **Topics:** cutting timeline, body-fat stages
- **Status:** `NEEDS_TRANSCRIPT`

---

## Reverse dieting, maintenance, and metabolism

### This is Why You Need To Reverse Diet After Losing Body Fat
- **URL:** https://www.youtube.com/watch?v=X8qr7E-bGnQ
- **Topics:** reverse diet, post-cut transition, maintenance
- **Core thesis:** The cut is incomplete until calories and activity are transitioned into a sustainable maintenance structure.
- **Status:** high-priority transcript target

### Eating Low Calories And Still Not Losing Weight? Here's Why
- **URL:** https://www.youtube.com/watch?v=hIsIeOImLdM
- **Topics:** metabolism, calorie tracking, plateau, reverse dieting
- **Indexed discussion:** Includes audience discussion of raising calories incrementally and finding a new maintenance intake.
- **Status:** high-priority transcript target

### How to Increase your Metabolism for Faster Fat Loss
- **URL:** https://www.youtube.com/watch?v=ofPQdeO0uI8
- **Topics:** metabolism, activity, muscle, calorie expenditure
- **Status:** `NEEDS_TRANSCRIPT`
- **Safety:** `VERIFY_EXTERNALLY`

---

## Protein, nutrition, and meals

### Protein and Fat Loss / Everything you Need to Know
- **URL:** https://www.youtube.com/watch?v=G5RrlQgrNtk
- **Topics:** protein, satiety, lean-mass retention
- **Status:** high-priority transcript target

### The Protein Expert: Fat Loss Gets EASIER When You Understand This
- **URL:** https://www.youtube.com/watch?v=XTWDoFs4PE8
- **Topics:** protein, emotional eating, muscle, sustainable fat loss
- **Guest:** Angelo Keely, co-founder of Kion
- **Status:** `NEEDS_TRANSCRIPT`
- **Note:** Separate guest claims from Max Rogers' own doctrine.

### 4 Simple High Protein Breakfast Ideas
- **URL:** https://www.youtube.com/watch?v=VaHfFNA6HV0
- **Topics:** meal ideas, protein, muscle growth
- **Status:** recipe extraction pending

### How to Drink Alcohol and STILL Lose Fat
- **URL:** https://www.youtube.com/watch?v=UYTd1pTeL-w
- **Topics:** alcohol, calorie budgeting, adherence
- **Status:** transcript pending

### How To Work Out Your Calories & Macros To Lose Fat and Build Muscle
- **URL:** https://www.youtube.com/watch?v=ZwbreXAdUb8
- **Topics:** calorie calculation, macros, cardio
- **Status:** high-priority formula extraction target

### How To Eat For a Lean, Masculine Body
- **URL:** https://www.youtube.com/watch?v=D-8fALR6_Ys
- **Topics:** food selection, lean physique, sustainable eating
- **Status:** transcript pending

---

## Muscle growth, recomp, and lean gaining

### Building Muscle Is Easy Once You Do This
- **URL:** https://www.youtube.com/watch?v=0pN-ex6ra_o
- **Topics:** muscle growth, training progression
- **Status:** transcript pending

### The Best 3-Day Workout Split for Muscle Growth (Full Program)
- **URL:** https://www.youtube.com/watch?v=lDrmERA6i-Y
- **Topics:** 3-day split, muscle growth, full program
- **Status:** high-priority workout extraction target

### How To Build Muscle And Lose Fat At The Same Time: Step by Step
- **URL:** https://www.youtube.com/watch?v=M4K0s792wAU
- **Topics:** body recomposition, calories, macros
- **Indexed description:** References a detailed body-recomposition guide covering calorie and macro setup.
- **Status:** high-priority transcript target

### The Exact System To Build Muscle And Lose Fat At The Same Time
- **URL:** https://www.youtube.com/watch?v=9tOg-IhDvzE
- **Topics:** body recomposition
- **Status:** transcript pending

### The Ultimate Lean Bulking Guide / Gain Muscle Without Fat
- **URL:** https://www.youtube.com/watch?v=I28ZB2h3P4c
- **Topics:** lean bulk, calorie surplus, tracking
- **Status:** high-priority transcript target

### What Everyone Gets Wrong About Skinny Fat
- **URL:** https://www.youtube.com/watch?v=0fAvdgZd7sk
- **Topics:** skinny fat, cut versus bulk, recomposition
- **Status:** transcript pending

---

## Steps and cardio

### The steps you do, burn fat and get you leaner faster.... but why?
- **URL:** https://www.youtube.com/watch?v=pFAYzNVUZno
- **Topics:** steps, NEAT, cardio, fat loss
- **Indexed description:** Explicitly contrasts steps with cardio and explains why walking can be effective.
- **Status:** high-priority transcript target

### Why You Can't Lose Fat With Hybrid Training (And What To Do)
- **URL:** https://www.youtube.com/watch?v=rLuhSJss8H8
- **Topics:** hybrid training, fatigue, interference, fat loss
- **Status:** transcript pending

---

# 17. High-Priority Transcript Queue

Extract these first because they define the operating system of the codex:

1. This is Why You Need To Reverse Diet After Losing Body Fat
2. If You Always Lose Fat & Gain It Back… Watch This
3. How To Get Lean & STAY Lean Forever
4. The Best 3-Day Workout Split for Muscle Growth
5. How To Work Out Your Calories & Macros
6. Protein and Fat Loss / Everything You Need to Know
7. Eating Low Calories And Still Not Losing Weight?
8. How to Drop Body Fat Forever
9. 30% to 12% Body Fat | Timeline Explained
10. This Is Why You Can't Reach 12% Body Fat
11. The Ultimate Lean Bulking Guide
12. The Exact System To Build Muscle And Lose Fat At The Same Time
13. The Steps You Do Burn Fat...
14. What Everyone Gets Wrong About Skinny Fat
15. How to Drink Alcohol and STILL Lose Fat

---

# 18. Transcript Extraction Prompt

Use the following prompt for each video transcript:

```markdown
You are updating the Max Rogers Fitness Knowledge Codex.

Analyze this transcript without adding outside advice.

Return:

1. Video metadata
2. One-sentence core thesis
3. Concise structured summary
4. Every actionable recommendation
5. Every numeric target, formula, range, rate, duration, frequency, or threshold
6. Preconditions and exceptions
7. Statements Max presents as facts
8. Personal opinions or coaching preferences
9. Client examples
10. Changes or contradictions versus existing doctrine
11. Search tags
12. Related codex doctrine IDs
13. Claims that require external scientific verification
14. Five to ten timestamped key passages, paraphrased
15. A 100-word dashboard answer

Evidence rules:
- Do not invent missing numbers.
- Label exact statements DIRECT.
- Label synthesis RECURRING or INFERRED.
- Preserve uncertainty.
- Distinguish Max Rogers' statements from guest statements.
```

---

# 19. Daily Update Merge Format

```markdown
## YYYY-MM-DD Channel Update

### New video
- **Title:**
- **URL:**
- **Published:**
- **Core thesis:**
- **Action items:**
- **Numeric targets:**
- **Topics:**
- **Evidence depth:**
- **New doctrine introduced:**
- **Existing doctrine reinforced:**
- **Potential contradiction or revision:**
- **Transcript status:**
```

---

# 20. Suggested Repository Structure

```text
max-rogers-codex/
├── README.md
├── CLAUDE.md
├── codex/
│   ├── 00-index.md
│   ├── 01-core-philosophy.md
│   ├── 02-phase-model.md
│   ├── 03-fat-loss.md
│   ├── 04-nutrition.md
│   ├── 05-training.md
│   ├── 06-cardio-steps.md
│   ├── 07-reverse-diet.md
│   ├── 08-maintenance.md
│   ├── 09-lean-gaining.md
│   ├── 10-plateaus.md
│   └── 11-myths.md
├── videos/
│   ├── index.json
│   └── VIDEO_ID.md
├── transcripts/
│   └── VIDEO_ID.txt
├── data/
│   ├── doctrines.json
│   ├── videos.json
│   ├── tags.json
│   └── update-log.json
├── prompts/
│   ├── transcript-extraction.md
│   ├── contradiction-check.md
│   └── daily-update.md
└── app/
    └── dashboard-spec.md
```

---

# 21. Dashboard Product Requirements

## Home screen
- Universal search
- Current phase selector
- Goal shortcuts
- Recently added videos
- Most cited doctrines
- “What would Max recommend?” query box

## Search results
Each result should show:

- Direct answer
- Topic
- Phase
- Evidence label
- Source count
- Most recent supporting video
- Expandable reasoning
- Related doctrines

## Video page
- Embedded video
- Concise summary
- Action items
- Numeric targets
- Chapters
- Transcript search
- Claims
- Related videos
- Contradiction history

## Compare mode
Compare two doctrines or videos by:

- Calories
- Protein
- Cardio
- Steps
- Training
- Timeline
- Body-fat range
- Maintenance strategy

## Update center
- Last channel check
- New videos
- Transcript pending
- Doctrine changes
- Merge status
- Review warnings

---

# 22. Quality-Control Rules

1. Never fabricate a transcript.
2. Never attribute a guest's statement to Max.
3. Preserve publication dates because advice may evolve.
4. Prefer the newest comprehensive video over an older short clip.
5. Keep older videos as historical evidence.
6. Flag contradictions rather than silently resolving them.
7. Separate “what Max says” from “what research says.”
8. Health and safety claims require external verification.
9. Numeric prescriptions require transcript-level evidence.
10. Every dashboard answer should link to supporting videos.

---

# 23. Current Best Concise Summary

Max Rogers' system is a phase-based approach to building and maintaining a lean, muscular body. The recurring foundation is accurate calorie control, high protein, progressive resistance training, a consistent step baseline, and strategic—not excessive—cardio. Fat loss should proceed through data-based adjustments rather than emotional reactions to daily scale changes. As body fat falls, precision and adherence become more important, especially around the 16–20% range. The diet is not complete when the target weight is reached: calories, cardio, and habits must transition into maintenance through a structured post-diet phase. Long-term success depends on staying within a body-weight range, continuing to lift, correcting small regains early, and using controlled lean-gaining phases rather than repeated crash cuts and rebounds.

---

# 24. Research Sources Used for Initial Build

- Max Rogers YouTube channel: https://www.youtube.com/@Maxinomuscle
- YouTube-indexed channel and video descriptions
- Search-indexed video titles and excerpts discovered on 2026-07-25

This document should be treated as the foundation for transcript-backed expansion, not the final exhaustive transcript archive.
