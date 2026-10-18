# CrossFit Web

Responsive React and Vite PWA for the CrossFit training application.

## Structure

- `src/app`: application composition and the root component.
- `src/features`: user-facing capabilities, added when each feature is implemented.
- `src/shared`: reusable UI, API and utility code, added only when shared by multiple features.

## API access

The app calls the backend under `/api/v1`. In development, Vite proxies `/api` to `http://localhost:3000`; set `VITE_API_BASE_URL` at build time to point to a different base path.
