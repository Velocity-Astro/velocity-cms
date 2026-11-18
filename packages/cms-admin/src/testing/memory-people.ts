import { AccessControl, ConflictError, NotFoundError, ROLES, ValidationError, type Actor, type Role } from '@velocity/cms-core';
import type { NewPerson, Person } from '../client/admin-client.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who can sign in, kept in memory, with the rules a real site's sign-in applies: only owners
 * manage people, an address is here once, nobody removes themselves and one owner always stays.
 * It stands in for `cms-auth` behind both test clients.
 */
export class MemoryPeople {
  readonly #people: Person[];
  readonly #access = new AccessControl();

  constructor(people: readonly Person[] = []) {
    this.#people = [...people];
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
    const added: Person = { id: `person-${this.#people.length + 1}`, email, name: person.name.trim(), role: person.role };
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
