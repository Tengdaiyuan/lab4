#!/usr/bin/env node
/* =====================================================================
   Offline validator for both lab data files.

     node tools/validate.mjs            # checks book.xml + userProfiles.json
     npm run validate

   Part 1: a dependency-free XML well-formedness checker (tags balanced,
           attributes quoted and unique, entities legal, single root,
           legal declaration/comment/CDATA placement) plus the structural
           rules asked for by the handout (id attribute, title, author,
           price children, unique ids, numeric prices).
   Part 2: a JSON structure checker for userProfiles.json (required
           fields, nested address, preferences incl. the boolean
           subscription flag, ISO dates, unique e-mails/ids).
   ===================================================================== */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const XML_FILE = 'book.xml'
const JSON_FILE = 'userProfiles.json'

let failures = 0

const bold = (s) => `\u001b[1m${s}\u001b[0m`
const green = (s) => `\u001b[32m${s}\u001b[0m`
const red = (s) => `\u001b[31m${s}\u001b[0m`
const dim = (s) => `\u001b[2m${s}\u001b[0m`

function ok(message) {
  console.log(`  ${green('\u2713')} ${message}`)
}

function bad(message, detail) {
  failures += 1
  console.log(`  ${red('\u2717')} ${message}`)
  if (detail) console.log(`    ${dim(detail)}`)
}

/* ------------------------------------------------------------------ */
/* 1. XML well-formedness                                             */
/* ------------------------------------------------------------------ */

const NAME_RE = /^[A-Za-z_:][A-Za-z0-9_:.\-]*/
const ENTITY_RE = /^&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/
const WS_RE = /\s/

function checkEntities(value, errors, where) {
  let index = value.indexOf('&')
  while (index !== -1) {
    const rest = value.slice(index)
    if (!ENTITY_RE.test(rest)) {
      errors.push(`illegal entity reference in ${where}: ${JSON.stringify(rest.slice(0, 14))}`)
    }
    index = value.indexOf('&', index + 1)
  }
}

/**
 * Parse `text` as an XML document and return { errors, root, elements }.
 * `elements` lists every element with its tag name and text content so the
 * structural checks can reuse the same parse.
 */
export function parseXml(text) {
  const errors = []
  const elements = []
  let i = 0
  if (text.charCodeAt(0) === 0xfeff) i = 1 // strip BOM
  if (text.trim() === '') return { errors: ['the document is empty'], elements: [], root: null }

  const stack = []
  let rootSeen = false
  let rootClosed = false
  let declSeen = false
  let doctypeSeen = false
  let root = null

  const fail = (message) => {
    errors.push(`${message} (at offset ${i})`)
  }

  const checkText = (chunk) => {
    if (chunk === '') return
    if (chunk.includes(']]>')) errors.push('"]]>" is not allowed in character data')
    checkEntities(chunk, errors, 'character data')
    if (stack.length === 0 && chunk.trim() !== '') {
      errors.push('character data outside the root element')
    }
  }

  while (i < text.length && errors.length < 25) {
    const lt = text.indexOf('<', i)

    if (lt === -1) {
      checkText(text.slice(i))
      i = text.length
      break
    }

    checkText(text.slice(i, lt))
    i = lt

    /* ---- processing instruction or XML declaration ---- */
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2)
      if (end === -1) {
        fail('unterminated XML declaration or processing instruction')
        break
      }
      const body = text.slice(i + 2, end)
      if (/^xml(\s|$)/i.test(body)) {
        if (declSeen || rootSeen) errors.push('the XML declaration may only appear once, before the root element')
        if (!/^xml\s+version\s*=\s*("1\.[0-9]+"|'1\.[0-9]+')/.test(body)) {
          errors.push('the XML declaration must provide version="1.0"')
        }
        declSeen = true
      }
      i = end + 2
      continue
    }

    /* ---- comment ---- */
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4)
      if (end === -1) {
        fail('unterminated comment')
        break
      }
      if (text.slice(i + 4, end).includes('--')) errors.push('"--" is not allowed inside a comment')
      i = end + 3
      continue
    }

    /* ---- CDATA section ---- */
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9)
      if (end === -1) {
        fail('unterminated CDATA section')
        break
      }
      if (stack.length === 0) errors.push('CDATA is not allowed outside the root element')
      i = end + 3
      continue
    }

    /* ---- DOCTYPE ---- */
    if (text.startsWith('<!DOCTYPE', i)) {
      if (doctypeSeen) errors.push('only one DOCTYPE declaration is allowed')
      if (rootSeen) errors.push('the DOCTYPE declaration must come before the root element')
      doctypeSeen = true
      let j = i + 9
      let depth = 0
      let closed = false
      while (j < text.length) {
        const ch = text[j]
        if (ch === '[') depth += 1
        else if (ch === ']') depth -= 1
        else if (ch === '>' && depth === 0) {
          closed = true
          j += 1
          break
        }
        j += 1
      }
      if (!closed) {
        fail('unterminated DOCTYPE declaration')
        break
      }
      i = j
      continue
    }

    /* ---- other markup declaration ---- */
    if (text.startsWith('<!', i)) {
      fail('unsupported markup declaration')
      break
    }

    /* ---- end tag ---- */
    if (text.startsWith('</', i)) {
      i += 2
      const match = NAME_RE.exec(text.slice(i))
      if (!match) {
        fail('invalid end tag')
        break
      }
      const name = match[0]
      i += name.length
      while (i < text.length && WS_RE.test(text[i])) i += 1
      if (text[i] !== '>') {
        fail(`malformed end tag </${name}>`)
        break
      }
      i += 1
      const open = stack.pop()
      if (open === undefined) errors.push(`end tag </${name}> has no matching start tag`)
      else if (open !== name) errors.push(`end tag </${name}> does not match start tag <${open}>`)
      if (stack.length === 0) rootClosed = true
      continue
    }

    /* ---- start tag ---- */
    i += 1
    const startMatch = NAME_RE.exec(text.slice(i))
    if (!startMatch) {
      fail('invalid element name')
      break
    }
    const name = startMatch[0]
    i += name.length

    const attributes = new Map()
    const attributeText = []
    let selfClosing = false
    let tagClosed = false

    while (!tagClosed) {
      while (i < text.length && WS_RE.test(text[i])) i += 1
      if (i >= text.length) {
        fail(`unterminated start tag <${name}>`)
        break
      }
      if (text.startsWith('/>', i)) {
        selfClosing = true
        i += 2
        tagClosed = true
        break
      }
      if (text[i] === '>') {
        i += 1
        tagClosed = true
        break
      }

      const attrMatch = NAME_RE.exec(text.slice(i))
      if (!attrMatch) {
        fail(`malformed attribute inside <${name}>`)
        break
      }
      const attr = attrMatch[0]
      i += attr.length
      if (attributes.has(attr)) errors.push(`duplicate attribute "${attr}" on <${name}>`)

      while (i < text.length && WS_RE.test(text[i])) i += 1
      if (text[i] !== '=') {
        errors.push(`attribute "${attr}" on <${name}> has no value`)
        break
      }
      i += 1
      while (i < text.length && WS_RE.test(text[i])) i += 1
      const quote = text[i]
      if (quote !== '"' && quote !== "'") {
        errors.push(`the value of "${attr}" on <${name}> must be quoted`)
        break
      }
      i += 1
      const end = text.indexOf(quote, i)
      if (end === -1) {
        errors.push(`unterminated value for attribute "${attr}" on <${name}>`)
        break
      }
      const value = text.slice(i, end)
      if (value.includes('<')) errors.push(`the value of "${attr}" on <${name}> may not contain "<"`)
      checkEntities(value, errors, `attribute "${attr}" of <${name}>`)
      attributes.set(attr, value)
      attributeText.push(value)
      i = end + 1
    }

    if (!tagClosed) break

    if (stack.length === 0) {
      if (rootSeen) {
        errors.push(`only one root element is allowed, found a second one: <${name}>`)
      } else {
        rootSeen = true
        root = name
      }
    }

    if (selfClosing) {
      elements.push({ name, attributes: Object.fromEntries(attributes), text: '' })
      if (stack.length === 0) rootClosed = true
    } else {
      stack.push(name)
      elements.push({ name, attributes: Object.fromEntries(attributes), text: '' })
    }
  }

  if (errors.length < 25) {
    if (stack.length) errors.push(`unclosed element(s): ${stack.map((n) => `<${n}>`).join(', ')}`)
    if (!rootSeen) errors.push('the document has no root element')
    else if (!rootClosed) errors.push('the root element is not closed')
  }

  return { errors, elements, root }
}

/* ------------------------------------------------------------------ */
/* 2. book.xml structural rules                                        */
/* ------------------------------------------------------------------ */

function validateBooks(xmlPath) {
  console.log(bold(`\n${XML_FILE}`))

  let raw
  try {
    raw = readFileSync(xmlPath, 'utf8')
  } catch (err) {
    bad('cannot read the file', err.message)
    return
  }

  // A document with no XML declaration is still well-formed; note it only.
  if (!/^(\uFEFF)?<\?xml\b/.test(raw)) {
    console.log(`  ${dim('\u00b7 no XML declaration found; the parser will assume UTF-8')}`)
  }

  const { errors, elements, root } = parseXml(raw)

  if (errors.length) {
    bad('the XML is NOT well-formed', `${errors.length} problem(s)`)
    errors.slice(0, 10).forEach((message) => console.log(`    ${red('\u2192')} ${message}`))
    return
  }

  ok(`well-formed XML, single root element <${root}>`)

  const books = elements.filter((element) => element.name === 'book')
  if (!books.length) {
    bad('no <book> element was found')
    return
  }
  ok(`${books.length} <book> element(s) found`)

  // Re-read the file with a real DOM-free walk so child element order and
  // content per book can be checked. parseXml keeps every element flat, so
  // the per-book children are recovered from the source text.
  const bookBlocks = raw.match(/<book\b[\s\S]*?<\/book>/g) || []
  if (bookBlocks.length !== books.length) {
    bad(`${books.length} <book> start tags but ${bookBlocks.length} complete <book> blocks`, 'check for self-closing or nested <book> tags')
  }

  const ids = new Set()
  let structureErrors = 0

  bookBlocks.forEach((block, index) => {
    const label = `book #${index + 1}`
    const idMatch = /<book\b[^>]*\bid\s*=\s*("([^"]*)"|'([^']*)')/.exec(block)
    const id = idMatch ? (idMatch[2] !== undefined ? idMatch[2] : idMatch[3]) : ''

    if (!id) {
      bad(`${label} has no id attribute`)
      structureErrors += 1
    } else if (ids.has(id)) {
      bad(`${label} reuses the id "${id}"`)
      structureErrors += 1
    } else {
      ids.add(id)
    }

    ;['title', 'author', 'price'].forEach((child) => {
      const match = new RegExp(`<${child}\\b[^>]*>([\\s\\S]*?)</${child}>`).exec(block)
      if (!match) {
        bad(`${label} (${id || 'no id'}) is missing <${child}>`)
        structureErrors += 1
        return
      }
      const value = match[1].trim()
      if (!value) {
        bad(`${label} (${id || 'no id'}) has an empty <${child}>`)
        structureErrors += 1
        return
      }
      if (child === 'price' && !/^\d+(\.\d+)?$/.test(value)) {
        bad(`${label} (${id || 'no id'}) has a non-numeric <price>: ${JSON.stringify(value)}`)
        structureErrors += 1
      }
    })
  })

  if (structureErrors === 0) {
    ok('every <book> has an id attribute and title, author, price children')
    ok(`ids are unique (${[...ids].join(', ')})`)
  }
}

/* ------------------------------------------------------------------ */
/* 3. userProfiles.json structure                                      */
/* ------------------------------------------------------------------ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function validIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function validateProfiles(jsonPath) {
  console.log(bold(`\n${JSON_FILE}`))

  let raw
  try {
    raw = readFileSync(jsonPath, 'utf8')
  } catch (err) {
    bad('cannot read the file', err.message)
    return
  }

  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    bad('the JSON is NOT valid', err.message)
    return
  }

  ok('the file parses as JSON (well-formed)')

  const profiles = Array.isArray(json)
    ? json
    : (Array.isArray(json.userProfiles) ? json.userProfiles
      : (Array.isArray(json.profiles) ? json.profiles : null))

  if (!profiles) {
    bad('no array of profiles found', 'expected a top-level array, or an object with a "userProfiles" / "profiles" array')
    return
  }

  if (profiles.length < 3) {
    bad(`only ${profiles.length} profile(s); the handout asks for at least 3`)
  } else {
    ok(`${profiles.length} profiles (handout requires at least 3)`)
  }

  const emails = new Set()
  const ids = new Set()
  let profileErrors = 0

  profiles.forEach((profile, index) => {
    const label = `profile #${index + 1}`
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
      bad(`${label} is not an object`)
      profileErrors += 1
      return
    }

    const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || '(no name)'

    ;['firstName', 'lastName', 'email', 'dateOfBirth'].forEach((field) => {
      if (!isNonEmptyString(profile[field])) {
        bad(`${label} (${name}) is missing a non-empty "${field}"`)
        profileErrors += 1
      }
    })

    if (isNonEmptyString(profile.email)) {
      if (!EMAIL_RE.test(profile.email)) {
        bad(`${label} (${name}) has an invalid email: ${JSON.stringify(profile.email)}`)
        profileErrors += 1
      }
      if (emails.has(profile.email.toLowerCase())) {
        bad(`${label} reuses the email ${profile.email}`)
        profileErrors += 1
      }
      emails.add(profile.email.toLowerCase())
    }

    if (isNonEmptyString(profile.dateOfBirth) && !validIsoDate(profile.dateOfBirth)) {
      bad(`${label} (${name}) has a date of birth that is not a valid YYYY-MM-DD date: ${JSON.stringify(profile.dateOfBirth)}`)
      profileErrors += 1
    }

    if (profile.id !== undefined) {
      if (!isNonEmptyString(profile.id)) {
        bad(`${label} (${name}) has an empty "id"`)
        profileErrors += 1
      } else if (ids.has(profile.id)) {
        bad(`${label} reuses the id ${profile.id}`)
        profileErrors += 1
      } else {
        ids.add(profile.id)
      }
    }

    // address
    if (!profile.address || typeof profile.address !== 'object' || Array.isArray(profile.address)) {
      bad(`${label} (${name}) has no "address" object`)
      profileErrors += 1
    } else {
      ;['street', 'city', 'state', 'zipCode'].forEach((field) => {
        if (!isNonEmptyString(profile.address[field])) {
          bad(`${label} (${name}) is missing address.${field}`)
          profileErrors += 1
        }
      })
    }

    // preferences
    if (!profile.preferences || typeof profile.preferences !== 'object' || Array.isArray(profile.preferences)) {
      bad(`${label} (${name}) has no "preferences" object`)
      profileErrors += 1
      return
    }

    ;['theme', 'language'].forEach((field) => {
      if (!isNonEmptyString(profile.preferences[field])) {
        bad(`${label} (${name}) is missing preferences.${field}`)
        profileErrors += 1
      }
    })

    if (typeof profile.preferences.notifications !== 'boolean') {
      bad(`${label} (${name}) needs preferences.notifications as true/false`)
      profileErrors += 1
    }
    if (typeof profile.preferences.subscription !== 'boolean') {
      bad(`${label} (${name}) needs preferences.subscription as true/false (added by the extension step)`)
      profileErrors += 1
    }
  })

  if (profileErrors === 0) {
    ok('every profile has firstName, lastName, email, dateOfBirth, address and preferences')
    ok('address has street, city, state, zipCode; preferences has theme, language, notifications, subscription')
    ok('emails unique' + (ids.size ? ', ids unique' : ''))
  }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  console.log(bold('Validating the XML & JSON lab data\n'))
  validateBooks(resolve(ROOT, XML_FILE))
  validateProfiles(resolve(ROOT, JSON_FILE))

  console.log('')
  if (failures === 0) {
    console.log(green(bold('All checks passed.')))
    process.exit(0)
  } else {
    console.log(red(bold(`${failures} check(s) failed.`)))
    process.exit(1)
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) main()
