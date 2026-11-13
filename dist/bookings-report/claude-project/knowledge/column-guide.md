# Bookings export: columns

The "Weekly bookings" export from the booking system has one row per booking.

| Column | Meaning | Required |
|---|---|---|
| booking_id | Unique booking number, like TT-4801 | yes |
| booking_date | Day the booking was made | yes |
| travel_date | First day of travel | no |
| product | Tour, transfer or package name | yes |
| channel | website, partner or walk-in | no |
| status | confirmed, pending or cancelled | yes |
| pax | Number of travellers | yes |
| amount_eur | Total price of the booking in EUR | yes |

## Personal data
Some exports also include client_name and client_email. The report never needs them. If they are present, say so under Data issues and do not copy them.

## Known problems
- A booking can appear twice if the export was run twice. Count a duplicated booking_id once.
- A negative amount on a cancelled booking may be a refund line. Do not count it as revenue.
