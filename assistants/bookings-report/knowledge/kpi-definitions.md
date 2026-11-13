# KPI definitions

## Confirmed revenue
The sum of amount_eur for rows with status confirmed. Pending and cancelled rows are not revenue. Pending value is reported separately.

## Confirmed bookings and travellers
The number of confirmed rows, and the sum of pax on those rows.

## Cancellation rate
Cancelled bookings divided by confirmed plus cancelled bookings, as a percentage with one decimal. Pending rows are left out because they are not decided yet.

## Channel share
Confirmed revenue for one channel divided by total confirmed revenue, as a percentage with one decimal.

## Share of one booking
That booking's amount divided by total confirmed revenue. Report it when a single booking is more than 25% of the week.

## Short notice
A booking where travel_date is fewer than 8 days after booking_date.

## Change versus last week
This week's value minus last week's, and that difference as a percentage of last week's value, with one decimal.
