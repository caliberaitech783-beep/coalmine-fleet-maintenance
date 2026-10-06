import React, {useEffect, useRef, useState} from 'react';
import './vehicle-history-scroll.css';

// Keep a mouse-accessible scrollbar above the Vehicle History report.
export default function VehicleHistoryScroll({children, ...props}) {
  const viewport = useRef(null);
  const top = useRef(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    const measure = () => {
      setWidth(element.scrollWidth);
      setOverflow(element.scrollWidth > element.clientWidth + 1);
      if (top.current) top.current.scrollLeft = element.scrollLeft;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const observeTable = () => {
      const table = element.querySelector('table');
      if (table) resize.observe(table);
      measure();
    };
    const mutation = new MutationObserver(observeTable);
    mutation.observe(element, {childList: true, subtree: true, characterData: true});
    observeTable();
    return () => { resize.disconnect(); mutation.disconnect(); };
  }, []);
  const sync = (source, target) => {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };
  return <>
    <div ref={top} className="vehicle-history-top-scroll" hidden={!overflow}
      tabIndex={0} role="region" aria-label="Scroll Vehicle History table horizontally"
      onScroll={event => sync(event.currentTarget, viewport.current)}>
      <div style={{width, height: 1}} />
    </div>
    <div {...props} ref={viewport} onScroll={event => sync(event.currentTarget, top.current)}>{children}</div>
  </>;
}
