# Saved VOC views

The lazy sidebar page reads and writes through `@ap/feature-screens/global-screens/saved-views`.
The save form uses SDK `Input` and `Button`, with Korean and English messages in `saved-views-messages.ts`.
A pending create disables the form controls. The shared QueryClient mutation key also rejects repeated submit events before React renders the pending state.
A failed create retains the entered name and allows retry; success clears the name and refreshes the list.
Delete focus recovery uses the input ref, independent of its translated accessible name.
