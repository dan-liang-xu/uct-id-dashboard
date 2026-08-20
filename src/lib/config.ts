// Google Maps API key for the Street View window. Set VITE_GOOGLE_MAPS_API_KEY
// in .env.local (a browser key with the Maps JavaScript API enabled + billing;
// restrict it to your dev/deploy origins). Empty -> Street View shows a hint.
export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
