# Compound Fitness Technical Architecture

**Last Updated:** 2026-07-24

**Status:** Active

---

## High Level Architecture

```
Native App Shell
      ↓
JavaScript Bridge
      ↓
     PWA
      ↓
 Backend API
      ↓
  Database
```

---

## Native Shell Responsibilities

- HealthKit
- Health Connect
- Push Notifications
- Bluetooth
- Background Sync
- Camera
- Face ID
- Biometrics
- Native Permissions

Nothing else.

The shell should remain thin.

---

## PWA Responsibilities

- UI
- Navigation
- Charts
- Dashboard
- Logging
- AI Chat
- Coach Portal
- Settings

The PWA owns the product.

---

## Backend Responsibilities

- Authentication
- Database
- AI
- Analytics
- Media
- Messaging
- Coach Portal
- Reports
- Scheduling

---

## Design Philosophy

One backend.

One web app.

Two native wrappers.

One codebase.

---

## JavaScript Bridge

The bridge exposes native functionality.

**Examples**

- `Health.getHeartRate()`
- `Health.getWorkoutZones()`
- `Notifications.schedule()`
- `Bluetooth.startWorkout()`
- `Camera.capture()`

The PWA never talks directly to native APIs.

Only through the bridge.

---

## Future Native Features

- Apple Watch
- Wear OS
- Live Activities
- Widgets
- Dynamic Island
- Background workout tracking
- Voice coaching
- CarPlay
- Apple Vision Pro
