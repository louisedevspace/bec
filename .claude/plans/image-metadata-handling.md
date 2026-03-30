# Image Metadata Handling Plan

## Current State
- `client/src/lib/image-compress.ts` already has `compressUserImage` (preserves EXIF) and `compressAdminImage` (strips metadata)
- **4 upload locations are missing compression entirely**

## Changes

### 1. Improve `image-compress.ts` quality settings
- `compressUserImage`: increase `maxSizeMB` from 0.5 to 1.0 for better quality, keep `preserveExifData: true`
- `compressAdminImage` / `canvasCompress`: increase quality from 0.75 to 0.85 for better visual quality while still stripping metadata
- Keep `maxWidthOrHeight: 1600` for both

### 2. Add compression to Deposit Modal (`deposit-modal.tsx`)
- Import `compressUserImage`
- In `submitDepositRequestMutation`, compress the screenshot before appending to FormData
- User upload → preserves all metadata (EXIF, GPS, timestamps, original filename)

### 3. Add compression to Admin Withdraw Modal (`admin-withdraw-requests-modal.tsx`)
- Import `compressAdminImage`
- In `handleSubmitReview`, compress the screenshot before appending to FormData
- Admin upload → strips all metadata

### 4. Add compression to Loan Application Modal (`loan-application-modal.tsx`)
- Import `compressUserImage`
- In `handleSubmit` (inside mutation), compress each document file before appending to FormData
- User upload → preserves all metadata

### 5. Add compression to Loan Page (`loan.tsx`)
- Import `compressUserImage`
- In `handleSubmit`, compress each document before uploading to Supabase Storage
- User upload → preserves all metadata

## Files Modified
1. `client/src/lib/image-compress.ts` — quality improvements
2. `client/src/components/modals/deposit-modal.tsx` — add `compressUserImage`
3. `client/src/components/modals/admin-withdraw-requests-modal.tsx` — add `compressAdminImage`
4. `client/src/components/modals/loan-application-modal.tsx` — add `compressUserImage`
5. `client/src/pages/loan.tsx` — add `compressUserImage`

## Summary
- User uploads: compress + preserve EXIF/GPS/metadata → deposit, KYC, support chat, loan docs, profile pic
- Admin uploads: compress + strip all metadata → admin support chat, admin withdraw screenshots
