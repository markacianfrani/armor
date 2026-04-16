# Draw.io XML Reference

This file is the local reference for generating native `.drawio` files.
Do not fetch remote documentation when using this skill.

## Minimal valid document

A valid single-page draw.io file uses `mxGraphModel` with the required root cells:

```xml
<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
  </root>
</mxGraphModel>
```

Use `id="0"` and `id="1"` exactly once.

## Vertex pattern

Most boxes, circles, labels, and containers are vertices:

```xml
<mxCell id="node-1" value="Start" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="80" y="80" width="120" height="60" as="geometry" />
</mxCell>
```

Rules:
- `vertex="1"` marks a shape node
- `parent="1"` attaches it to the default layer
- `value` is the displayed label; use escaped XML entities
- Every vertex must have a child `mxGeometry` with `x`, `y`, `width`, `height`

## Edge pattern

Connections between shapes are edges:

```xml
<mxCell id="edge-1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="node-1" target="node-2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

Rules:
- `edge="1"` marks a connector
- Always include a child `<mxGeometry relative="1" as="geometry" />`
- Use `source` and `target` with existing cell ids when possible
- For free-standing labels on an edge, add `value="..."`

## Common styles

Style strings are `key=value;` pairs.

### Generic process box

```text
rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;
```

### Decision diamond

```text
rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;
```

### Terminator / start-end

```text
ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;
```

### Actor / external system

```text
shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;
```

### Database

```text
shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#f5f5f5;strokeColor=#666666;
```

### Note / annotation

```text
shape=note;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;
```

### Container / swimlane

```text
swimlane;whiteSpace=wrap;html=1;rounded=1;horizontal=1;startSize=30;fillColor=#ffffff;strokeColor=#666666;
```

### Group box / boundary

```text
rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=none;strokeColor=#666666;
```

### Straight connector

```text
endArrow=block;endFill=1;html=1;
```

### Orthogonal connector

```text
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;
```

### Curved connector

```text
curved=1;html=1;endArrow=block;endFill=1;
```

## Positioning and geometry

### Absolute placement

Use explicit `x`, `y`, `width`, `height` values for predictable output.

### Edge waypoints

When an edge needs manual routing, include `mxPoint` elements inside an `Array`:

```xml
<mxCell id="edge-2" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="a" target="b">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="260" y="150" />
      <mxPoint x="260" y="260" />
    </Array>
  </mxGeometry>
</mxCell>
```

Use manual waypoints sparingly. Prefer clean layout first.

## Text and HTML labels

Recommended defaults:

```text
whiteSpace=wrap;html=1;
```

For multiline labels, plain text with line breaks usually works best:
- `value="Line 1&#xa;Line 2"`

Avoid complex embedded HTML unless necessary.

## Common diagram patterns

### Flowchart
- Start/end: ellipse
- Step: rounded rectangle
- Decision: rhombus
- Use orthogonal edges
- Keep top-to-bottom or left-to-right consistently

### Architecture diagram
- Use containers/swimlanes for trust boundaries or domains
- Use dashed boundaries for external systems / networks
- Prefer simple rectangles over ornate icons unless specifically requested
- Label arrows with protocols or events only when useful

### ER diagram
- Entity: rectangle
- Attribute list: use line breaks inside `value`
- Relationships: labeled edges or narrow diamonds if needed
- Use monospaced styling only if the user asks

### Sequence-like diagram
Draw.io can represent sequence diagrams with plain shapes:
- Participant header: rectangle
- Lifeline: thin dashed vertical line
- Messages: horizontal arrows
- Activation: narrow filled rectangles

## Containers, groups, and nesting

A container is still a vertex. Child nodes can use the container id as parent:

```xml
<mxCell id="container-1" value="API" style="swimlane;whiteSpace=wrap;html=1;rounded=1;horizontal=1;startSize=30;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="320" height="220" as="geometry" />
</mxCell>
<mxCell id="child-1" value="Service" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="container-1">
  <mxGeometry x="20" y="50" width="120" height="60" as="geometry" />
</mxCell>
```

When nesting:
- Child coordinates are relative to the parent container
- Use containers to reduce edge crossings and show ownership

## Layers / pages

For this skill, default to a single page unless the user explicitly asks for multiple pages.

Stay with:
- one `mxGraphModel`
- one default layer via `id="1"`
- all content under `parent="1"` or nested under a container

## Metadata and tags

Only add metadata when it serves the user’s request.

Useful optional attributes on `mxCell`:
- `value="..."` — visible label
- `id="..."` — unique identifier

Avoid adding undocumented custom attributes unless needed. Keep generated XML minimal.

## Color guidance

Use restrained colors. Good defaults:
- Blue: `fillColor=#dae8fc;strokeColor=#6c8ebf;`
- Green: `fillColor=#d5e8d4;strokeColor=#82b366;`
- Yellow: `fillColor=#fff2cc;strokeColor=#d6b656;`
- Red: `fillColor=#f8cecc;strokeColor=#b85450;`
- Gray: `fillColor=#f5f5f5;strokeColor=#666666;`
- White: `fillColor=#ffffff;strokeColor=#666666;`

### Dark-mode-friendly choices

If the user asks for dark mode, prefer darker fills with lighter text/strokes:
- Surface: `fillColor=#1f2937;strokeColor=#9ca3af;fontColor=#f9fafb;`
- Secondary: `fillColor=#374151;strokeColor=#d1d5db;fontColor=#f9fafb;`
- Accent blue: `fillColor=#1d4ed8;strokeColor=#93c5fd;fontColor=#eff6ff;`
- Accent green: `fillColor=#065f46;strokeColor=#6ee7b7;fontColor=#ecfdf5;`

Also set `fontColor` explicitly in dark diagrams.

## XML well-formedness rules

These are mandatory:
- Do not include XML comments
- Escape special characters in attributes and text:
  - `&` → `&amp;`
  - `<` → `&lt;`
  - `>` → `&gt;`
  - `"` → `&quot;`
- Every `mxCell` id must be unique
- Every opening tag must close correctly
- Every edge must include child `mxGeometry`
- Do not leave stray text outside elements
- Prefer self-closing tags only when valid XML is preserved

## Practical generation checklist

Before writing the file, verify:
1. The document starts with `mxGraphModel`
2. Root cells `0` and `1` exist
3. Every node/edge id is unique
4. Every vertex has `vertex="1"` and geometry
5. Every edge has `edge="1"`, geometry, and valid source/target ids when connected
6. All labels are XML-escaped
7. The layout is consistent and readable

## Starter template

Use this as the default template for simple diagrams:

```xml
<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="start" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="80" y="80" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="step" value="Do work" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="260" y="80" width="140" height="60" as="geometry" />
    </mxCell>
    <mxCell id="end" value="Done" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="460" y="80" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="edge-1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="start" target="step">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="edge-2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="step" target="end">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

Use this reference instead of any remote XML reference.