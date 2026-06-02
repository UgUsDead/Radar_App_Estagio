import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
}

export function requireFeature(feature: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }
    
    if (req.user.role === "admin" || req.user.permissions.includes(feature)) {
      next();
    } else {
      res.status(403).json({ error: `Access denied. Requires feature: ${feature}` });
    }
  };
}
