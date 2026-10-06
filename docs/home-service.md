# Home Service booking

Home Service extends the normal service, staff, availability, appointment, customer and payment domains. A service can be offered at the business, as Home Service, or both. Existing appointments default to `BUSINESS_LOCATION`; booking mode, fee, travel buffers and precise destination are immutable appointment snapshots.

## Configuration

Owners and authorized administrators set the business service-area origin and optional maximum radius in **Admin → Settings → Home Service area**. Enabling a radius requires both configured business coordinates. A missing origin or an out-of-range destination is rejected on the server. Service settings separately control supported locations, a fixed Home Service fee, and travel time before and after the visit. At least one location mode must remain enabled.

The fixed fee is added to the service price in minor currency units. Full payment is based on that total. Percentage deposits are rounded up to the smallest currency unit and apply to the total including the Home Service fee. A fixed deposit keeps its configured fixed amount. The appointment and payment lifecycle, including PayMongo verification, is unchanged.

## Booking and availability

Home Service requires an authenticated customer account with the email verification already required by the booking database routine. Guest booking remains available for business-location appointments. The browser may request device location only after the customer presses **Use my current location**. Address entry and manually adjusted latitude/longitude remain available when geolocation is denied or unsupported.

The destination is a static appointment address, not background location collection or live tracking. Customers can request device location after an explicit tap or enter coordinates manually. An OpenStreetMap preview displays the current pin; editing the coordinate fields moves it. The interface does not geocode addresses or provide draggable-pin controls. If the external preview is unavailable, address and coordinate fields remain usable. Map preview/navigation are adapters over normalized latitude/longitude, so a different provider can be added without changing stored appointment data.

Home Service availability runs through the current availability engine and additionally fits the service plus travel buffers into business/staff hours and checks occupied appointments. Any Available Staff is selected from that filtered set. Submission repeats the checks inside the trusted server/database boundary. Acceptance still performs the final schedule and overlap check. Pending requests do not reserve the slot, matching existing approval behavior.

## Location privacy

The precise address, coordinates, landmark and instructions are stored in `appointment_home_locations`, an RLS-protected table. Anonymous users and unrelated customers/staff cannot read it. The customer who owns the appointment and the owner/admin can read the destination. Assigned staff see the general area while the request is pending; exact details become available after acceptance/operational confirmation. Exact coordinates are never returned from public catalog or availability projections.

Operational emails include a Home Service label and authenticated appointment link; they do not include the precise address or coordinates. Location changes/rescheduling are not exposed. The customer must contact the business to request an operational change. Destination reads are not individually audited because PostgreSQL row-level read policies do not provide a reliable per-row SELECT audit hook; appointment submission and settings changes are logged without coordinates.

## Setup and verification

Configure the business map pin and optional radius, then enable Home Service on a published service and set fee/travel values. Test with a verified customer account, a destination within the configured area, and each approval mode. Confirm guest submission is rejected by the trusted RPC and that staff sees only the general area before accepting. The map link requires a network connection to the selected external provider.
