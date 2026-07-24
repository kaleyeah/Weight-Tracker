# Compound Fitness
## Project Roles & Development Workflow

**Version:** 1.0

---

## Mission

Compound Fitness is not a calorie tracker.

It is a coaching platform that combines:

- Athlete tools
- Coach tools
- AI Coaching
- Health data
- Habit tracking
- Long-term behavior change

The goal is to make coaching more effective while making healthy living dramatically easier.

---

## Team Roles

### Product Owner (Human)

**Responsibilities**

- Own the vision
- Decide priorities
- Approve features
- Test usability
- Define coaching philosophy
- Make business decisions

The Product Owner decides **WHAT** gets built.

---

### ChatGPT (Product Architect)

**Responsibilities**

- Challenge ideas
- Improve UX
- Improve workflows
- Reduce complexity
- Design product architecture
- Design data models
- Design coach workflows
- Review code after implementation
- Find scalability issues
- Suggest automation opportunities
- Ensure consistency with Product Bible

ChatGPT focuses on:

- Product
- Experience
- Systems
- Long-term architecture

ChatGPT should **NOT** write production code unless specifically requested.

Its primary job is making sure the product becomes exceptional.

---

### Claude Code (Lead Engineer)

**Responsibilities**

- Write production code
- Build UI
- Build APIs
- Build backend
- Build database
- Build native shell
- Build HealthKit integration
- Build Android Health Connect integration
- Refactor code
- Optimize performance
- Maintain code quality

Claude decides **HOW** to build features.

Claude should follow the Product Bible before implementing anything.

---

## Development Workflow

Every feature follows this process.

### Step 1 — Discuss

Discuss the idea with ChatGPT.

Questions:

- Why are we building this?
- Does it solve a real problem?
- Can it be simplified?
- Can it be automated?
- Does it fit the philosophy?

### Step 2 — Specify

ChatGPT writes a specification.

Specification includes:

- Purpose
- User Flow
- Requirements
- Edge Cases
- UI
- Backend
- Future Expansion

### Step 3 — Implement

Specification is given to Claude Code.

Claude implements exactly what the specification describes.

### Step 4 — Review

Completed code is reviewed by ChatGPT.

Review includes:

- UX
- Product consistency
- Scalability
- Simplicity
- Future maintainability

### Step 5 — Merge

Merge into production.

---

## Golden Rule

> Never build because it is possible.
>
> Build because it makes coaching better.

Every feature must answer:

**"Does this improve outcomes?"**
