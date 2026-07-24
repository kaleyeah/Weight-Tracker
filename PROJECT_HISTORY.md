# Compound Fitness — Project History

**Last Updated:** 2026-07-24

**Status:** Active

---

## Project Overview

Compound Fitness began as a personal fitness tracking application.

The original goal was to create something that made daily health tracking easier than existing fitness applications while remaining simple enough that users would continue using it every day.

As development progressed, it became clear that the project was evolving into something much larger than a tracker.

The vision expanded into a complete coaching platform capable of serving:

- Individual athletes
- Clients
- Human coaches
- AI coaches
- Coaching businesses

The application is now being designed as a platform rather than a single-purpose app.

---

## Original Athlete App

The first version focused almost entirely on the athlete experience.

Current features include:

- Weight tracking
- Progress photos
- Workout logging
- Cardio logging
- Nutrition and macro tracking
- Meal planning
- AI coaching
- Weekly goals
- Cardio tracking
- GLP-1 medication logging
- Injection site rotation
- Trend charts
- Progress summaries

The application is currently approximately **90–95% complete** from the athlete perspective.

Future work on the athlete app should prioritize polish and automation over adding additional manual features.

---

## Important Product Decision

One of the biggest architectural decisions was deciding **NOT** to build separate applications.

Instead:

- One backend.
- One primary web application.
- Thin native wrappers.
- Multiple user experiences.

The athlete app, coach portal, and future AI systems all operate on the same platform.

---

## Native Shell Decision

A major realization occurred during product planning.

Instead of rebuilding the existing PWA as a native application, Compound Fitness should continue using the PWA as the primary interface.

Native applications exist only to expose device capabilities that web applications cannot access.

Responsibilities of the native shell include:

- Apple Health
- HealthKit
- Android Health Connect
- Bluetooth
- Push notifications
- Background sync
- Camera
- Biometrics
- Native permissions
- Apple Watch support
- Wear OS support

Everything else remains inside the PWA.

This dramatically reduces development effort while preserving future flexibility.

---

## Health Data Philosophy

The platform should import data whenever possible.

Users should not manually enter information that already exists.

Potential imported information includes:

- Weight
- Heart rate
- Resting heart rate
- HRV
- Workout duration
- Calories burned
- Heart-rate zones
- Sleep
- Steps
- Activity
- VO2 Max
- Cardio workouts

Raw imported data should always remain separate from calculated metrics.

This allows future algorithms to improve without losing original information.

---

## Wearable Philosophy

The platform should not attempt to become another WHOOP.

Instead:

- Import available wearable data.
- Use it to power Compound Fitness coaching.

**Examples**

Instead of reproducing a proprietary recovery score, display:

- HRV trend
- Resting HR trend
- Sleep trend
- Training load
- Zone minutes

Then allow AI and coaches to interpret those metrics.

Transparency is preferred over mystery scores.

---

## AI Philosophy

AI exists to reduce friction.

Not replace coaches.

AI responsibilities include:

- Explain trends
- Summarize progress
- Draft weekly reports
- Identify adherence issues
- Generate coaching suggestions
- Highlight unusual patterns
- Draft messages
- Reduce repetitive administrative work

Human coaches always retain final authority.

---

## Coach Philosophy

Human coaches remain central to the platform.

The platform should make coaches more efficient rather than replacing them.

The long-term goal is allowing coaches to serve significantly more clients while maintaining or improving coaching quality.

**Examples**

Instead of reading every check-in manually, AI identifies:

- Clients needing attention
- Clients missing macros
- Clients missing workouts
- Clients plateauing
- Clients rapidly improving

The coach reviews recommendations before sending feedback.

---

## Product Philosophy

The platform should answer one question:

> "What is the next best action?"

Everything should point toward action rather than simply displaying information.

Every screen should help someone make a better decision.

---

## Development Workflow

The development process was intentionally separated into three roles.

### Product Owner

- Defines vision.
- Approves features.
- Sets priorities.
- Makes business decisions.

### ChatGPT

Acts as **Product Architect**.

Responsibilities include:

- Product strategy
- UX review
- Architecture
- Long-term planning
- Feature refinement
- Scalability review
- Product consistency
- Design critique

ChatGPT should challenge assumptions.

Its job is to make the product better — not simply larger.

### Claude Code

Acts as **Lead Software Engineer**.

Responsibilities include:

- Writing production code
- Building APIs
- Building UI
- Database development
- Native shell implementation
- Testing
- Refactoring
- Performance improvements

Claude decides how to implement.

ChatGPT helps decide what should be implemented.

---

## Current Roadmap

### Phase 1

Athlete application (nearly complete)

### Phase 2

Native shell — HealthKit, Health Connect, Bluetooth, Push notifications, Background sync, App Store release

### Phase 3

Coach dashboard — Client management, Workout builder, Meal plans, Messaging, Weekly reviews, Video feedback

### Phase 4

Coach AI — Weekly summaries, Suggested macro adjustments, Suggested workout changes, Compliance monitoring, Risk detection

### Phase 5

Platform — Subscriptions, Organizations, Coach businesses, API, Marketplace, Enterprise features

---

## Major Design Principles

1. Automate before asking users to type.
2. Trends are more valuable than snapshots.
3. Data should lead to action.
4. Explain recommendations.
5. Simplicity beats feature count.
6. Human coaches remain central.
7. AI amplifies people.
8. One codebase whenever practical.
9. Native only when necessary.
10. Every feature must improve outcomes.

---

## Long-Term Goal

Compound Fitness should become the operating system for fitness coaching.

An athlete should only need one application.

A coach should only need one dashboard.

AI should make both dramatically more effective.

---

## Definition of Success

Success is **not** measured by:

- Number of features
- Number of charts
- Amount of data collected

Success **is** measured by:

- Better adherence
- Better coaching
- Better decisions
- Better health outcomes
- More efficient coaching businesses
- Sustainable long-term behavior change

Everything built should move the platform toward those goals.
