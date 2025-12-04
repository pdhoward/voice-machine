import { ComponentProps, useEffect, useRef } from "react";
import { gsap } from "gsap";

export function AddToCartButton(props: ComponentProps<"button">) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const btn = btnRef.current;
    const main = mainRef.current;
    if (!btn || !main) return;

    const text = btn.querySelector(".atc__text") as HTMLElement;
    const cart = btn.querySelector(".atc__cart") as HTMLElement;
    const item = btn.querySelector(".atc__cart-content") as HTMLElement;
    const dummy = btn.querySelector(".atc__cart--dummy") as HTMLElement;
    const check = btn.querySelector(".atc__check") as HTMLElement;

    const animatedBorder = btn.querySelector(
      ".atc__border--animated:not(.atc__border--demo)"
    ) as HTMLElement;

    const staticBorder = btn.querySelector(".atc__border--static") as HTMLElement;
    const completeBorder = btn.querySelector(".atc__border--complete") as HTMLElement;

    gsap.set(item, { y: -24 });

    const addToCart = () => {
      if (running.current) return;
      running.current = true;

      btn.dataset.adding = "true";

      const dummyRect = dummy.getBoundingClientRect();
      const cartRect = cart.getBoundingClientRect();

      const distance = dummyRect.left - cartRect.left;
      const scale = 1.5;

      gsap
        .timeline({
          onComplete: () => {
            running.current = false;
            btn.dataset.adding = "false";
          },
        })
        .set(main, { "--complete": 1 })
        .to(cart, { x: distance / scale, duration: 0.22 })
        .to(
          cart,
          { rotate: -20, yoyo: true, repeat: 1, duration: 0.11 },
          0
        )
        .to(
          text,
          {
            opacity: 0,
            x: distance / scale,
            duration: 0.22,
            filter: "blur(6px)",
          },
          0
        )
        .to(item, { y: 0, duration: 0.1, delay: 0.1 })
        .to(staticBorder, { opacity: 1, duration: 0.1 }, "<")
        .set(main, { "--complete": 0 })
        .set(animatedBorder, { opacity: 0 })
        .to(cart, { x: (distance / scale) * 4, duration: 0.6, delay: 0.1 })
        .to(cart, { rotate: -30, duration: 0.1 }, "<")
        .to(completeBorder, { opacity: 1, duration: 0.22 }, "<")
        .to(
          check,
          {
            opacity: 1,
            yoyo: true,
            scale: 1.5,
            duration: 0.25,
            repeatDelay: 0.125,
            repeat: 1,
          },
          "<"
        )
        .set(text, { x: 0 })
        .set(cart, { x: -100, rotate: 0 })
        .set(item, { y: -24 })
        .to([staticBorder, completeBorder], {
          opacity: 0,
          duration: 0.5,
          delay: 0.125,
        })
        .to(text, { opacity: 1, duration: 0.22, filter: "blur(0)" })
        .to(cart, { x: 0 })
        .to(animatedBorder, { opacity: 1, duration: 1 });
    };

    btn.addEventListener("click", addToCart);

    return () => btn.removeEventListener("click", addToCart);
  }, []);

  return (
    <div className="atc-main" ref={mainRef}>
      <span className="atc__border atc__border--animated atc__border--demo" />

      <button
        ref={btnRef}
        className="atc"
        data-adding="false"
        {...props}
      >
        <span className="atc__content">
          <span className="atc__cart">
            <svg
              className="atc__icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect
                className="atc__cart-content"
                x="9"
                y="-1"
                width="10"
                height="10"
                rx="2"
              />
              <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17..." />
            </svg>
          </span>

          <span className="atc__cart--dummy">
            <svg
              className="atc__icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M2.25 2.25a.75.75..." />
            </svg>
          </span>

          <span className="atc__check">
            <svg
              className="atc__icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path d="M9 12.75 11.25 15 15 9.75..." />
            </svg>
          </span>

          <span className="atc__text">Add to cart</span>
        </span>

        <span className="atc__border atc__border--animated" />
        <span className="atc__border atc__border--static" />
        <span className="atc__border atc__border--complete" />
      </button>
    </div>
  );
}
