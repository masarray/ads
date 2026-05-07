import { useEffect, useState } from "react";

export function SldCanvas() {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/assets/SLD_ADS_HMI.svg")
      .then((response) => response.text())
      .then((markup) => {
        if (mounted) setSvg(markup);
      })
      .catch(() => {
        if (mounted) setSvg("");
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="sld-stage" aria-label="Single line diagram">
      <div className="sld-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
    </section>
  );
}
