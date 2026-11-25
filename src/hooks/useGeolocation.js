import { useState, useCallback } from "react";

export function useGeolocation() {
  const [loading, setLoading] = useState(false);

  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      setLoading(true);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLoading(false);
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (err) => {
          setLoading(false);
          let message = "Unable to retrieve your location.";
          if (err.code === err.PERMISSION_DENIED) {
            message = "Location permission denied. Please search for a city.";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            message = "Location information is unavailable.";
          } else if (err.code === err.TIMEOUT) {
            message = "Location request timed out.";
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }, []);

  return { getPosition, loading };
}
