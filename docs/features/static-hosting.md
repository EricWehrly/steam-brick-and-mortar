# Feature: Static Hosting

**Act**: 2 (Gate 1 — required before soliciting any feedback)
**Status**: Not Started
**Priority**: Critical

## Goal

Host the client application somewhere publicly accessible so friends can try it without running it locally. Static file hosting is the target — the client is a Vite-built SPA and has no server-side runtime requirements beyond the existing Lambda backend.

## Context

This is the single most load-bearing Gate 1 item: without a public URL, there is no "ready for friends." Everything else in Gate 1 (rate limiting, caching, input polish) is meaningless if people can't reach it.

The backend already lives in AWS (Lambda + API Gateway at `https://steam-api-dev.wehrly.com`). Extending the AWS footprint for hosting is the natural path — S3 + CloudFront is the obvious fit and would also serve as the CDN layer for the multi-layer caching feature, so there's overlap worth considering.

## Options to Discuss

- **S3 + CloudFront** — static assets in S3, CloudFront as CDN; aligns with the caching infrastructure already planned; custom domain straightforward via Route 53; HTTPS trivial via ACM
- **GitHub Pages** — zero-ops, free, but no custom domain HTTPS without workarounds and no CDN control
- **Netlify / Vercel** — easy CI/CD integration, free tier, good CDN; less overlap with existing AWS footprint but much lower ops burden
- **Cloudflare Pages** — similar to Netlify/Vercel but with Cloudflare's network; could pair with Cloudflare for rate limiting/DDoS down the line

## Acceptance Criteria

- Client is reachable at a public HTTPS URL without any local setup
- Deployment is repeatable (CI/CD or a documented manual deploy script)
- CORS configured correctly between hosted client and Lambda backend
- Custom domain (or at minimum a stable URL that can be shared)
- Build artifacts are not accidentally committed to the repo

## Stories / Tasks

- **Decide hosting approach** — evaluate S3+CloudFront vs. alternatives; consider overlap with caching infrastructure
- **Set up hosting** — provision chosen infrastructure; configure CORS, HTTPS, custom domain
- **CI/CD or deploy script** — `yarn build` → deploy should be one command or a documented two-step
- **Smoke test** — verify full flow works from the public URL: Steam ID entry, library load, scene render

## Notes / Open Questions

- S3 + CloudFront is probably the right call given existing AWS investment, but ops burden vs. Netlify/Vercel is worth a quick conversation before committing.
- If S3 + CloudFront is chosen, coordinate with the multi-layer caching feature — the CloudFront distribution for hosting and the one for artwork caching may be the same or separate distributions.
- WebXR requires HTTPS — this is non-negotiable regardless of host choice.
- The offline/bookmarklet export-format research (tracked in `docs/acts/act3-ready-for-everyone.md`) is related: if we ever want to circumvent Lambda, the hosted version is where that would matter most.
