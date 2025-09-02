import {
  expect,
  type Page,
  type BrowserContext,
  Locator,
} from "@playwright/test";
import { LinkType } from "./";
import { MailSlurp } from "mailslurp-client";
import { promises as fs } from "fs";

/**
 * Describes a CSS attribute expectation used when asserting style-related values.
 */
interface Css {
  name: string;
  value?: string;
  options?: {
    timeout?: number;
  };
}

/**
 * Navigation wait states mapped to Playwright's `page.goto` waitUntil values.
 */
type wait = "domcontentloaded" | "load" | "networkidle" | "commit";

/**
 * Utility to express simple text assertions.
 * - Use `toBe` for exact match.
 * - Use `toContain` for substring match.
 */
interface TextExists {
  toBe?: string;
  toContain?: string;
}

/**
 * Extends `Css` for attribute checks where `ignoreCase` may be relevant.
 */
interface Attribute extends Css {
  options?: {
    timeout?: number;
    ignoreCase?: boolean;
  };
}

/**
 * Base locator options used across helper methods to find elements.
 */
interface ValidateOptions {
  testId?: string;
  id?: string;
  classes?: string;
  nth?: number | "last";
  role?: Parameters<Page["getByRole"]>[0];
  roleName?: {
    name: string;
    exact?: boolean;
  };
  tag?: string;
  toBe?: boolean;
}

/**
 * Options for text verification on a target element.
 */
interface ValidateTextOptions extends ValidateOptions {
  text: string;
}

/**
 * Options to validate hyperlinks (href/target) on anchor-like elements.
 */
interface ValidateHypervincleOptions extends ValidateOptions {
  url: string;
  newTab?: boolean;
}

/**
 * Options to perform click-like actions on elements.
 */
interface ValidateClickOptions extends ValidateOptions {
  text?: string;
}

/**
 * Screenshot capture configuration for visual assertions.
 */
interface CaptureProperties {
  focus: "fullpage" | "section" | "element";
  element?: ValidateOptions;
  diffPixel?: number;
}

/**
 * Data shape representing a table head and body used for table assertions.
 */
interface TableProperties {
  headValues: string[];
  rows: string[][];
}

/**
 * High-level Playwright page helper used across tests to compose readable actions and assertions.
 * Provides locator composition helpers, UI state assertions, network response checks, downloads,
 * visual comparisons, and basic email waiting via MailSlurp.
 */
export class pageClass {
  readonly page: Page;
  readonly context: BrowserContext;

  /**
   * Create a new `pageClass` helper bound to a Playwright `Page` and its `BrowserContext`.
   */
  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
  }

  /**
   * Navigate to the base site and assert status code and common security headers.
   * Also validates a custom `monitoring-id` header equals the given `monitoringId`.
   */
  async verifyStatusAndSecurityHeaders(monitoringId: string) {
    //function to verify page status and security headers
    try {
      const response = await this.page.goto("https://sierracolenergy.com/");
      if (response) {
        const header: { [key: string]: string } = response.headers();
        expect(response.status()).toBe(200);
        expect(header).toHaveProperty("x-xss-protection");
        expect(header).toHaveProperty("strict-transport-security");
        expect(header).toHaveProperty("x-frame-options");
        expect(header).toHaveProperty("x-content-type-options");
        expect(header).toHaveProperty("content-security-policy");
        expect(header).toHaveProperty("referrer-policy");
        expect(header["monitoring-id"]).toBe(monitoringId);
      } else {
        expect(response, "no se obtuvo respuesta").toBeTruthy();
      }
    } catch (error) {
      console.error(`Error al acceder a la página: ${error.message}`);
    }
  }

  async verifyResponses() {
    this.page.on("response", (response) => {
      switch (LinkType(response.url(), this.page.url())) {
        case "Video":
          return expect(
            response.status() == 200 ||
              response.status() == 204 ||
              response.status() == 206 ||
              response.status() == 304,
            `la petición ${response.url()} dio un statuscode ${response.status()}`
          ).toBeTruthy();
        case "GA":
          return expect(
            response.status() == 200 ||
              response.status() == 204 ||
              response.status() == 302 ||
              response.status() == 304,
            `la petición ${response.url()} dio un statuscode ${response.status()}`
          ).toBeTruthy();
        case "YT":
          return expect(
            response.status() == 200 || response.status() == 204,
            `la petición ${response.url()} dio un statuscode ${response.status()}`
          ).toBeTruthy();
        case "Exception":
          return;
        case "Ignore":
          return;
        default:
          return expect(
            response.status() == 200 ||
              response.status() == 204 ||
              response.status() == 206 ||
              (response.status() >= 300 && response.status() < 400),

            `la petición ${response.url()} dio un statuscode ${response.status()}`
          ).toBeTruthy();
      }
    });
  }

  /**
   * Clear cookies and navigate to `url`, optionally waiting for a specific lifecycle event.
   */
  async initialize(url: string, wait?: wait) {
    //function to initialize page
    await this.context.clearCookies();
    if (wait) {
      await this.page.goto(url, { waitUntil: wait });
    } else {
      await this.page.goto(url);
    }
  }

  /**
   * Abort matching network requests using a string or regular expression route pattern.
   */
  async abort(abort: string | RegExp) {
    await this.page.route(abort, (route) => route.abort());
  }

  /**
   * Scroll the page vertically by `yValue` pixels or to the full document height when set to "height".
   */
  async scrollDownBy(yValue: number | "height") {
    if (yValue == "height") {
      await this.page.evaluate((y) => {
        window.scrollBy(0, document.body.scrollHeight);
      }, yValue);
    } else {
      await this.page.evaluate((y) => {
        window.scrollBy(0, y);
      }, yValue);
    }
  }

  async deleteElement({
    testId,
    id,
    classes,
    text,
    role,
    roleName,
    tag,
    nth,
  }: ValidateClickOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }

    const element = locator;
    await element.evaluate((el) => el.remove());
  }

  /**
   * Perform visual assertions by capturing screenshots of the full page, a section, or a specific element.
   * Uses Playwright snapshot comparisons with optional `maxDiffPixelRatio`.
   */
  async verifyDesing(capture: string, properties: CaptureProperties) {
    //function to check design
    switch (properties.focus) {
      case "fullpage":
        await this.page.evaluate(async () => {
          const scrollStep = 100;
          const delay = (ms) => new Promise((res) => setTimeout(res, ms));
          for (let y = 0; y < document.body.scrollHeight; y += scrollStep) {
            window.scrollTo(0, y);
            await delay(100); // Espera pequeña entre scrolls
          }
        });
        if (properties.diffPixel) {
          expect(
            await this.page.screenshot({ fullPage: true })
          ).toMatchSnapshot(
            capture, //Write rute of the snapshot here
            { maxDiffPixelRatio: properties.diffPixel }
          );
        } else {
          expect(
            await this.page.screenshot({ fullPage: true })
          ).toMatchSnapshot(capture);
        }
        break;
      case "section":
        if (properties.diffPixel) {
          expect(
            await this.page.screenshot({ fullPage: false })
          ).toMatchSnapshot(
            capture, //Write rute of the snapshot here
            { maxDiffPixelRatio: properties.diffPixel }
          );
        } else {
          expect(
            await this.page.screenshot({ fullPage: false })
          ).toMatchSnapshot(capture);
        }
        break;
      case "element":
        let locator: Locator | null = null;
        let baseUsed:
          | "testId"
          | "id"
          | "classes"
          | "tag"
          | "role"
          | "text"
          | null = null;

        // Establecer base del locator
        if (properties.element?.testId) {
          locator = this.page.getByTestId(properties.element.testId);
          baseUsed = "testId";
        } else if (properties.element?.id) {
          locator = this.page.locator(`#${properties.element.id}`);
          baseUsed = "id";
        } else if (properties.element?.classes) {
          locator = this.page.locator(`.${properties.element.classes}`);
          baseUsed = "classes";
        } else if (properties.element?.tag) {
          locator = this.page.locator(properties.element.tag);
          baseUsed = "tag";
        } else if (properties.element?.role) {
          locator = this.page.getByRole(
            properties.element.role,
            properties.element.roleName
              ? {
                  name: properties.element.roleName.name,
                  exact: properties.element.roleName.exact,
                }
              : {}
          );
          baseUsed = "role";
        } else {
          throw new Error(
            "Must provide at least one of testId, id, classes, tag, or role."
          );
        }

        if (properties.element?.id && baseUsed !== "id") {
          locator = locator.locator(`#${properties.element.id}`);
        }

        // Agrega class solo si no fue base
        if (properties.element?.classes && baseUsed !== "classes") {
          locator = locator.locator(`.${properties.element.classes}`);
        }

        // Agrega role solo si no fue base
        if (properties.element?.role && baseUsed !== "role") {
          locator = locator.getByRole(
            properties.element.role,
            properties.element.roleName
              ? {
                  name: properties.element.roleName.name,
                  exact: properties.element.roleName.exact,
                }
              : {}
          );
        }

        // Agrega tag solo si no fue base
        if (properties.element?.tag && baseUsed !== "tag") {
          locator = locator.locator(properties.element.tag);
        }

        // Manejar nth
        if (typeof properties.element?.nth === "number") {
          locator = locator.nth(properties.element.nth);
        } else if (properties.element?.nth === "last") {
          locator = locator.last();
        }

        if (properties.diffPixel) {
          expect(await locator.screenshot()).toMatchSnapshot(
            capture, //Write rute of the snapshot here
            { maxDiffPixelRatio: properties.diffPixel }
          );
        } else {
          expect(await locator.screenshot()).toMatchSnapshot(capture);
        }
    }
  }

  /**
   * Assert that a located element's text equals or does not equal the expected `text`.
   */
  async verifyText({
    testId,
    id,
    classes,
    text,
    role,
    tag,
    nth,
    roleName,
    toBe = true,
  }: ValidateTextOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "id" | "classes" | "tag" | "role" | "text" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else {
      throw new Error(
        "Must provide at least one of testId, id, classes, tag, or role."
      );
    }
    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }

    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    if (toBe) {
      await expect(locator).toHaveText(text, { timeout: 10_000 });
    } else {
      await expect(locator).not.toHaveText(text, { timeout: 10_000 });
    }
  }

  /**
   * Assert that a located element has (or does not have) a specific attribute or attribute value.
   * If `value` is omitted, only the presence/absence of the attribute is checked.
   */
  async verifyAttribute(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    { name, value, options }: Attribute,
    toBe = true
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    //function to check attributes on a page element
    if (value) {
      if (toBe) {
        await expect(locator).toHaveAttribute(name, value, options);
      } else {
        await expect(locator).not.toHaveAttribute(name, value, options);
      }
    } else {
      const hasAtt: string | null = await locator.getAttribute(name);
      if (toBe) {
        expect(hasAtt).not.toBe(null);
      } else {
        expect(hasAtt).toBe(null);
      }
    }
  }

  /**
   * Assert CSS via attribute checks. When `value` is provided, verifies the attribute value.
   * When omitted, verifies presence/absence of the attribute.
   * Note: This uses attribute checks, not computed styles.
   */
  async verifyCss(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    { name, value, options }: Css,
    toBe = true
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }
    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    // Assert CSS values using computed CSS matcher
    if (value !== undefined) {
      if (toBe) {
        await expect(locator).toHaveCSS(name, value, options);
      } else {
        await expect(locator).not.toHaveCSS(name, value, options);
      }
      return;
    }
    // When no value is provided, assert the property is present (non-empty)
    const computed = await locator.evaluate(
      (el, prop) =>
        getComputedStyle(el as Element).getPropertyValue(prop as string),
      name
    );
    if (toBe) {
      expect(computed.trim().length).toBeGreaterThan(0);
    } else {
      expect(computed.trim().length).toBe(0);
    }
  }

  /**
   * Assert element visibility state.
   */
  async TestVisible(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    visible = true
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }
    //Agregar id si no fue base

    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }

    if (visible == true) {
      await expect(locator).toBeVisible();
    } else {
      await expect(locator).not.toBeVisible();
    }
  }

  /**
   * Assert whether an element exists (based on visibility heuristic) on the page.
   */
  async TestExist(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    exist = true
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }
    //Agregar id si no fue base

    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    let isHere: boolean = await locator.isVisible();
    if (exist === true) {
      expect(isHere).toBeTruthy();
    } else {
      expect(isHere).not.toBeTruthy();
    }
  }

  /**
   * Fill text into an input-like element located by the provided options.
   */
  async writeInput(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    write: string
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    await locator.fill(write);
  }

  /**
   * Clear the value of an input-like element.
   */
  async clearInput({
    testId,
    id,
    classes,
    text,
    role,
    roleName,
    tag,
    nth,
  }: ValidateClickOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }

    await locator.clear();
  }

  /**
   * Assert the current page URL matches (or does not match) `url`.
   */
  async veryfiCurrentPage(url: string, toBe: boolean = true) {
    //function to check the URL of the current page
    if (toBe) {
      await expect(this.page).toHaveURL(url);
    } else {
      await expect(this.page).not.toHaveURL(url);
    }
  }

  /**
   * Validate link attributes: ensures `href` equals `url` and optionally that it opens in a new tab via target="_blank".
   */
  async verifyHypervincle({
    testId,
    id,
    classes,
    nth,
    url,
    tag,
    roleName,
    role,
    newTab,
  }: ValidateHypervincleOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    if (newTab) {
      await expect(locator).toHaveAttribute("target", "_blank", {
        timeout: 10_000,
      });
    } else {
      await expect(locator).not.toHaveAttribute("target", "_blank", {
        timeout: 10_000,
      });
    }
    await expect(locator).toHaveAttribute("href", url, { timeout: 10_000 });
  }

  /**
   * Click an element located by the provided options.
   */
  async clickElement({
    testId,
    id,
    classes,
    text,
    role,
    roleName,
    tag,
    nth,
  }: ValidateClickOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    // Improve click reliability by ensuring element is scrolled into view
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
  }

  /**
   * Hover over an element for an optional period (`time` provided as `timeout`).
   */
  async hoverElement(
    {
      testId,
      id,
      classes,
      text,
      role,
      roleName,
      tag,
      nth,
    }: ValidateClickOptions,
    time?: number
  ) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }
    await locator.hover({ timeout: time });
  }

  /**
   * Press a keyboard key on the active page (e.g., "Enter", "Escape").
   */
  async pressButton(button: string) {
    //function to press a keyboard button
    await this.page.keyboard.press(button);
  }

  /**
   * Validate an image's `src` attribute for an element referenced by `testId` (and optional role/nth).
   */
  async testImage({ testId, role, nth, url }: ValidateHypervincleOptions) {
    if (testId) {
      let locator: Locator = this.page.getByTestId(testId);
      if (role) {
        locator = locator.getByRole(role);
      }
      if (typeof nth === "number") {
        locator = locator.nth(nth);
      }
      if (nth === "last") {
        locator = locator.last();
      }
      await expect(locator).toHaveAttribute("src", url);
    }
  }

  /**
   * Validate video attributes (`src`, and optionally `autoplay`/`loop`) for a testId-labeled element.
   */
  async testVideo(
    locator: string,
    properties: {
      src: string;
      autoplay?: boolean;
      loop?: boolean;
    }
  ) {
    //function to check video properties
    await expect(this.page.getByTestId(locator)).toHaveAttribute(
      "src",
      properties.src
    );
    if (properties.autoplay) {
      await expect(this.page.getByTestId(locator)).toHaveAttribute("autoplay");
    } else if (properties.autoplay === false) {
      await expect(this.page.getByTestId(locator)).not.toHaveAttribute(
        "autoplay"
      );
    }
    if (properties.loop) {
      await expect(this.page.getByTestId(locator)).toHaveAttribute("loop");
    } else if (properties.loop === false) {
      await expect(this.page.getByTestId(locator)).not.toHaveAttribute("loop");
    }
  }

  /**
   * Wait until a located element becomes visible.
   */
  async waitfor({
    testId,
    id,
    classes,
    text,
    role,
    roleName,
    tag,
    nth,
  }: ValidateClickOptions) {
    let locator: Locator | null = null;
    let baseUsed: "testId" | "tag" | "role" | "text" | "id" | "classes" | null =
      null;

    // Establecer base del locator
    if (testId) {
      locator = this.page.getByTestId(testId);
      baseUsed = "testId";
    } else if (id) {
      locator = this.page.locator(`#${id}`);
      baseUsed = "id";
    } else if (classes) {
      locator = this.page.locator(`.${classes}`);
      baseUsed = "classes";
    } else if (tag) {
      locator = this.page.locator(tag);
      baseUsed = "tag";
    } else if (role) {
      locator = this.page.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
      baseUsed = "role";
    } else if (text) {
      locator = this.page.getByText(text);
      baseUsed = "text";
    } else {
      throw new Error(
        "Must provide at least one of testId, tag, role, or text."
      );
    }

    //Agregar id si no fue base
    if (id && baseUsed !== "id") {
      locator = locator.locator(`#${id}`);
    }

    // Agrega class solo si no fue base
    if (classes && baseUsed !== "classes") {
      locator = locator.locator(`.${classes}`);
    }
    // Agrega role solo si no fue base
    if (role && baseUsed !== "role") {
      locator = locator.getByRole(
        role,
        roleName ? { name: roleName.name, exact: roleName.exact } : {}
      );
    }

    // Agrega tag solo si no fue base
    if (tag && baseUsed !== "tag") {
      locator = locator.locator(tag);
    }

    // Agrega filtro por texto solo si no fue base
    if (text && baseUsed !== "text") {
      locator = locator.filter({ hasText: text });
    }

    // Manejar nth
    if (typeof nth === "number") {
      locator = locator.nth(nth);
    } else if (nth === "last") {
      locator = locator.last();
    }

    await locator.waitFor({ state: "visible" });
  }

  // --- Backwards-compatible, consistently named aliases ---

  /** Alias of `verifyDesing` with corrected spelling. */
  async verifyDesign(capture: string, properties: CaptureProperties) {
    return this.verifyDesing(capture, properties);
  }

  /** Alias of `veryfiCurrentPage` with corrected spelling. */
  async verifyCurrentPage(url: string, toBe: boolean = true) {
    return this.veryfiCurrentPage(url, toBe);
  }

  /** Alias of `verifyHypervincle` with a clearer name. */
  async verifyHyperlink(options: ValidateHypervincleOptions) {
    return this.verifyHypervincle(options);
  }

  /** Alias of `waitfor` with conventional casing. */
  async waitFor(options: ValidateClickOptions) {
    return this.waitfor(options);
  }

  /** Alias of `TestVisible` with conventional casing. */
  async testVisible(options: ValidateClickOptions, visible = true) {
    return this.TestVisible(options, visible);
  }

  /** Alias of `TestExist` with conventional casing. */
  async testExist(options: ValidateClickOptions, exist = true) {
    return this.TestExist(options, exist);
  }

  /** Alias of `TestTable` with conventional casing. */
  async testTable(props: TableProperties, testId: string) {
    return this.TestTable(props, testId);
  }

  /**
   * Validate a table structure: headers and each cell's text based on the provided matrix.
   */
  async TestTable({ headValues, rows }: TableProperties, testId: string) {
    for (let index = 0; index < headValues.length; index++) {
      await expect(
        this.page.getByTestId(testId).locator("thead tr th").nth(index)
      ).toHaveText(headValues[index]);
    }
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows[i].length; j++) {
        const row: Locator = this.page.locator(`tbody tr`).nth(i);
        if (rows[i].length != 0) {
          const cell = row.locator("td").nth(j);
          await expect(cell).toHaveText(rows[i][j]);
        }
      }
    }
  }

  /**
   * Navigate back in browser history.
   */
  async backPage() {
    //function to go back
    await this.page.goBack();
  }

  /**
   * Reload the current page.
   */
  async reloadPage() {
    //function to reload page
    await this.page.reload();
  }

  /**
   * Wait for a file download to start, save it to `downloads/` and validate file name expectations.
   */
  async testDownload({ toBe, toContain }: TextExists) {
    // Start waiting for the download
    const [download] = await Promise.all([
      this.page.waitForEvent("download"), // Waits for the download to start
    ]);

    const suggestedFilename = download.suggestedFilename();

    // Ensure downloads directory exists before saving
    await fs.mkdir("downloads", { recursive: true });
    await download.saveAs(`downloads/${suggestedFilename}`);
    if (toBe) {
      expect(suggestedFilename).toBe(toBe);
    }
    if (toContain) {
      expect(suggestedFilename).toContain(toContain);
    }
  }

  /**
   * Wait for the latest email in a MailSlurp inbox, then assert sender and subject.
   */
  async waitMail(
    mailslurp: MailSlurp,
    inboxId: string,
    from: string,
    subject: string
  ) {
    const mail = await mailslurp.waitForLatestEmail(inboxId, 20_000);
    expect(mail.from).toBe(from);
    expect(mail.subject).toBe(subject);
  }
}
