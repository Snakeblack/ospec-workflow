# Design: Add invoice export

## Technical Approach

A new read-only route serializes the existing `Invoice` model to CSV using the
project's existing serialization helper.

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/routes/invoices.js` | Modify | Add `GET /invoices/export.csv` |
