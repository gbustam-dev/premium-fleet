## 2024-05-14 - Optimizing calculateLogStats in React
**Learning:** Found a significant performance bottleneck in `calculateLogStats` where the `allLogs` array was being filtered and sorted for every single log processed in `App.tsx`'s loop (O(N^2 log N)). In a React application, if a utility function is repeatedly called during a render cycle to derive data, caching computations based on array references is crucial.
**Action:** Used a `WeakMap` keyed by the `allLogs` array reference to cache the sorted logs by `vehicleId`. This reduces the complexity to O(N log N) while naturally handling cache invalidation (since React state updates create new array references) and preventing memory leaks. Next time, always check utility functions called within `.map()` or loops during rendering for redundant O(N) or O(N log N) operations.

## 2024-05-18 - The Silent Cache Buster: Unmemoized Arrays Passed as Props
**Learning:** In React, dynamically creating arrays within a component's render function (like filtering logs) and passing them down as props can silently break downstream optimizations. In this case, recreating `filteredLogs` on every render of the main `App` component invalidated a `WeakMap` cache (`sortedLogsCache`) used in `getSortedVehicleLogs`. Since the object reference of the array kept changing, the cache lookup continually failed, turning an O(1) cache hit into an O(N^2 log N) sorting bottleneck on every render pass.
**Action:** Always verify if passed-down array/object props are relied upon for caching (like WeakMaps or memoization dependencies) downstream. Memoize expensive derivations (`useMemo`) or use stable references when possible, especially in root or high-level components.
## 2024-04-04 - React Render Blocking string evaluation
**Learning:** Found an O(N) evaluation inside render loops using 50+ sequential string `.includes()` checks to resolve static assets (logos) causing synchronous main thread blocking. Also found `new Date()` being instantiated inside `Array.prototype.filter` callbacks causing high GC pressure.
**Action:** Use `Map` caching for resolving static strings. Hoist loop-invariant object instantiations like `new Date()` outside of high-frequency loops and filters.

## 2024-05-19 - Optimizing map/filter/slice on large arrays in utility functions
**Learning:** Chaining array methods like `slice(0, index).map(...).filter(...).slice(-10)` inside a frequently called render loop function (`calculateLogStats`) creates intermediate arrays and causes an O(N) iteration overhead for each element.
**Action:** Replace the functional array chain with an early-exit backward `for` loop. This avoids creating intermediate objects and limits the operations to O(1) by stopping exactly when the required 10 elements are gathered, reducing overall computational complexity from O(N^2) to O(N) during the `map` phase over all logs.

## 2024-05-20 - Optimizing Date Sorting and Filtering using String Comparisons
**Learning:** Instantiating `new Date()` objects within `.sort()` or `.filter()` loops creates significant performance overhead and GC pressure. For ISO-formatted date strings (e.g., YYYY-MM-DD), the standard alphabetical string comparison gives identical sorting logic but avoids object creation entirely.
**Action:** Replaced `new Date(a.date).getTime() - new Date(b.date).getTime()` with `a.date < b.date ? -1 : a.date > b.date ? 1 : 0` and replaced `.getMonth() === currentMonth` checks with string `startsWith()` operations. Always favor string comparisons over Date instantiations within high-frequency loops when the dates are formatted appropriately.

## 2024-05-21 - UTC Timezone Shifts in Local Date String Generation
**Learning:** When attempting to bypass `new Date()` allocations by generating ISO strings from local `Date` objects, using `last30Days.toISOString().split('T')[0]` is dangerous. Because `toISOString()` returns UTC time, it can cause the resulting date string to shift backwards or forwards by a day depending on the user's timezone offset and the time of day. This creates subtle, intermittent bugs in filtering logic.
**Action:** Always manually assemble local date strings using `.getFullYear()`, `.getMonth() + 1`, and `.getDate()` padded with `padStart(2, '0')` when comparing against local date strings (YYYY-MM-DD), avoiding `toISOString()` entirely unless specifically working in UTC.
