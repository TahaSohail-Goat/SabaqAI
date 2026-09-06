# Changelog

All notable changes to Sabaq AI are documented here. Entries are grouped by day and drawn
directly from merged pull requests — nothing here is aspirational or planned; if it's listed,
it shipped to `main`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/),
adapted for a project without version tags (this is a single evolving hackathon build, not a
series of releases).

Full commit-level detail for any entry: `git log --grep "#<PR number>"` or browse the PR itself
at `github.com/TahaSohail-Goat/SabaqAI/pull/<number>`.

## 2026-09-06

### Added
- Real analytics charts on the Dashboard (subject accuracy, activity trends) (#58)
- A Settings shortcut in the Topbar, reachable from anywhere in the app (#59)

### Changed
- Sidebar nav rebuilt as filled pills with nested icon chips — a more classical, deliberate rail
  design (#57)
- Chrome-vs-canvas contrast strengthened across both themes (measured against WCAG, not
  eyeballed) and the active nav pill given a real gradient fill (#60)
- Islamiyat and Pakistan Studies subject offerings corrected for HSSC-I and HSSC-II (#54)

### Security
- Resolved findings from an Aikido security scan of `main` (#55)

### Content
- Ingested HSSC (Class 11–12) Physics, Math, Computer Science, Chemistry, and Biology textbooks (#47, #52, #53, #56)

## 2026-09-05

### Added
- `/explore` rebuilt as a real 3D orbital scene (three.js) — a discovery layer on top of Ask (#49)
- Account deletion, gated behind email OTP confirmation (#46)
- A new circular logo mark, replacing the earlier squircle badge (#51)

### Fixed
- Production hardening pass — CSP and build-time issues found after deploying to Vercel (#48)
- Vercel build switched to standalone output (#42)
- Build warnings cleaned up (#43)

### Docs
- README refreshed for hackathon submission (#44)

## 2026-09-04

### Fixed
- Settings, Plan, and Progress pages corrected for accounts created via Google OAuth (#41)

## 2026-09-03

### Added
- UI refinements to the revision Plan module (#40)

### Removed
- The standalone Evaluation module, folded into Progress (#38)

## 2026-09-02

### Added
- Plan module: a day-by-day revision schedule computed live from quiz mastery, not
  LLM-generated (#36)

## 2026-09-01

### Added
- Full Math textbooks ingested for Classes 9–10 (#29)

### Changed
- Light theme made the default (#34)
- Ask module renamed and its error messaging clarified (#33)
- General UI polish pass (#31)

### Fixed
- Page state now persists correctly across a refresh (#35)

## 2026-08-31

### Added
- Quiz module: chapter-scoped MCQ/short/long-answer generation, server-side grading, resumable
  drafts and history (#27)

## 2026-08-30

### Added
- Google OAuth sign-in, with onboarding and the first Chat implementation (#16)
- A PDF viewer embedded directly in Ask, showing the real source page (#21)
- Profile picture upload and display (#20)

### Changed
- Ask page redesigned (#22)

### Security
- Session hardening — cookie flags, security headers (#19)

## 2026-08-28

### Added
- Landing page (#9)
- Initial frontend design pass (#8)
- FBISE syllabus crawler — the checksum-deduped, OCR-fallback ingestion pipeline that still
  runs weekly today (#15, in progress from this date)
- Embeddings switched to Jina AI (`jina-embeddings-v3`) behind a provider-agnostic client, so a
  future provider swap only touches config (#4, #5)

## 2026-08-26

### Added
- Initial commit — project scaffold, core AI modules (retrieval, guardrail, generation), CLI
  ingestion scripts, and the first hardened version of the confidence guardrail
