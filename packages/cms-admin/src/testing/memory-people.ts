import { AccessControl, ConflictError, ForbiddenError, NotFoundError, ROLES, ValidationError, type Actor, type Role, type Team, type TeamMember } from '@velocity-astro/cms-core';
import type { NewPerson, Person, Profile, ProfileChanges } from '../client/admin-client.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The id of the person asking. An access token has no profile. */
const self = (actor: Actor): string => {
  if (actor.kind !== 'user') throw new ForbiddenError('Only a person signed in has a profile.');
  return actor.id;
};

/** A name as the real sign-in keeps it. */
function nameFrom(typed: string): string {
  const name = typed.trim().replace(/\s+/g, ' ');
  const problem = name === '' ? 'Enter a name.' : name.length > 80 ? 'Keep the name to 80 characters.' : /[\p{Cc}<>]/u.test(name) ? 'Use plain words for the name, without angle brackets.' : null;
  if (problem !== null) throw new ValidationError(problem, [{ path: ['name'], message: problem }]);
  return name;
}

/**
 * Who can sign in, kept in memory, with the rules a real site's sign-in applies: only owners
 * manage people, an address is here once, nobody removes themselves and one owner always stays.
 * It stands in for `cms-auth` behind both test clients.
 */
export class MemoryPeople implements Team {
  readonly #people: Person[];
  readonly #access = new AccessControl();
  /** The links asked for to confirm a new address, by token. Only the latest of each person's works. */
  readonly #changes = new Map<string, { readonly id: string; readonly email: string }>();
  /** The token of the last link asked for, which a test opens as the person would. */
  lastEmailToken: string | null = null;

  constructor(people: readonly Person[] = []) {
    this.#people = [...people];
  }

  /** The team as the CMS sees it: ids, names and roles. */
  async members(): Promise<TeamMember[]> {
    return this.#people.map(({ id, name, role }) => ({ id, name, role })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listUsers(actor: Actor): Promise<Person[]> {
    this.#access.require(actor, 'user:manage');
    return [...this.#people].sort((a, b) => a.name.localeCompare(b.name));
  }

  async invite(actor: Actor, person: NewPerson): Promise<Person> {
    this.#access.require(actor, 'user:manage');
    const email = person.email.trim().toLowerCase();
    const issues = [
      ...(EMAIL.test(email) ? [] : [{ path: ['email'], message: 'Enter an email address, such as name@example.com.' }]),
      ...(person.name.trim() === '' ? [{ path: ['name'], message: "Enter the person's name." }] : []),
      ...(ROLES.includes(person.role) ? [] : [{ path: ['role'], message: `Choose a role: ${ROLES.join(', ')}.` }]),
    ];
    const [first] = issues;
    if (first) throw new ValidationError(first.message, issues);
    if (this.#people.some((other) => other.email === email)) throw new ConflictError(`${email} can already sign in.`);
    const added: Person = { id: `person-${this.#people.length + 1}`, email, name: person.name.trim(), role: person.role, hasSignedIn: false };
    this.#people.push(added);
    return added;
  }

  async changeRole(actor: Actor, id: string, role: Role): Promise<Person> {
    this.#access.require(actor, 'user:manage');
    const index = this.#indexOf(id);
    const person = this.#people[index] as Person;
    if (person.role === 'owner' && role !== 'owner') this.#requireAnotherOwner(id);
    const changed = { ...person, role };
    this.#people[index] = changed;
    return changed;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const index = this.#indexOf(id);
    if (actor.id === id) throw new ConflictError('You cannot remove yourself. Ask another owner to do it.');
    if (this.#people[index]?.role === 'owner') this.#requireAnotherOwner(id);
    this.#people.splice(index, 1);
  }

  async rename(actor: Actor, id: string, name: string): Promise<Person> {
    this.#access.require(actor, 'user:manage');
    const index = this.#indexOf(id);
    const changed = { ...(this.#people[index] as Person), name: nameFrom(name) };
    this.#people[index] = changed;
    return changed;
  }

  async profile(actor: Actor): Promise<Profile> {
    return this.#people[this.#indexOf(self(actor))] as Profile;
  }

  async updateProfile(actor: Actor, changes: ProfileChanges): Promise<Profile> {
    const index = this.#indexOf(self(actor));
    const { image: _image, ...person } = this.#people[index] as Profile;
    const name = changes.name === undefined ? person.name : nameFrom(changes.name);
    if (typeof changes.image === 'string' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(changes.image)) {
      throw new ValidationError('Choose a photo that is a JPEG, PNG or WebP.', [{ path: ['image'], message: 'Choose a photo that is a JPEG, PNG or WebP.' }]);
    }
    const image = changes.image === undefined ? _image : (changes.image ?? undefined);
    const changed: Profile = { ...person, name, ...(image !== undefined && { image }) };
    this.#people[index] = changed;
    return changed;
  }

  async askEmailChange(actor: Actor, typed: string): Promise<void> {
    const id = self(actor);
    const email = typed.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new ValidationError('Enter an email address, such as name@example.com.', [{ path: ['email'], message: 'Enter an email address, such as name@example.com.' }]);
    if (this.#people[this.#indexOf(id)]?.email === email) throw new ValidationError('That is already your address.', [{ path: ['email'], message: 'That is already your address.' }]);
    if (this.#people.some((person) => person.email === email)) throw new ConflictError('Someone on this site already signs in with that address. Choose another.');
    for (const [token, change] of this.#changes) if (change.id === id) this.#changes.delete(token);
    const token = `email-${this.#changes.size + 1}-${Date.now()}`;
    this.#changes.set(token, { id, email });
    this.lastEmailToken = token;
  }

  async confirmEmailChange(actor: Actor, token: string): Promise<Profile> {
    const id = self(actor);
    const change = this.#changes.get(token);
    if (change?.id !== id) throw new ConflictError('This link has ended, or it was for someone else. Ask for a new one on your profile.');
    this.#changes.delete(token);
    const index = this.#indexOf(id);
    const changed = { ...(this.#people[index] as Profile), email: change.email, hasSignedIn: true };
    this.#people[index] = changed;
    return changed;
  }

  #indexOf(id: string): number {
    const index = this.#people.findIndex((person) => person.id === id);
    if (index < 0) throw new NotFoundError('Person', id);
    return index;
  }

  #requireAnotherOwner(id: string): void {
    if (!this.#people.some((person) => person.role === 'owner' && person.id !== id)) {
      throw new ConflictError("This is the site's only owner, and a site needs one. Make someone else an owner first.");
    }
  }
}
