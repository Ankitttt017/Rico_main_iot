import React from "react";
import ricoLogo from "../../assets/rico-logo.png";

const BrandLogo = ({ compact = false, light = false, wordmark = false, className = "" }) => {
  if (wordmark) {
    return (
      <div className={`flex items-center ${className}`} aria-label="RICO Auto Industries Limited">
        <span className="rico-wordmark">RICO</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center ${className}`}>
        <img
          src={ricoLogo}
          alt="RICO Auto Industries Limited"
          className="h-16 w-auto object-contain"
          style={{ filter: light ? "brightness(0) invert(1)" : "none" }}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={ricoLogo}
        alt="RICO Auto Industries Limited"
        className="h-16 w-auto object-contain"
        style={{ filter: light ? "brightness(0) invert(1)" : "none" }}
      />
    </div>
  );
};

export default BrandLogo;
