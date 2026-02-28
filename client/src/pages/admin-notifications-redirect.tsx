import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";

export default function AdminNotificationsRedirect() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Redirect from old notifications page to new simplified version
    setLocation("/admin/notifications/simple");
  }, [setLocation]);
  
  return null;
}