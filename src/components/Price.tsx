/**
 * A formatted price in the mono face, with the decimal point (or comma) pulled in. Mono gives "." a full character's
 * width, which leaves gaps either side ("$9 . 99"); this closes them up so prices read as one number and take less room.
 * Screen readers get the plain text.
 */
export function Price({ children }: { children: string }) {
  const parts = children.split(/([.,])/)
  return (
    <>
      {parts.map((p, i) =>
        p === '.' || p === ',' ? (
          <span key={i} className="-mx-[0.18em]">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}
