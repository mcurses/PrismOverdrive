export class SequenceGate {
  private readonly lastSeqById = new Map<string, number>();

  shouldAccept(id: string, seq?: number | null): boolean {
    if (seq == null) {
      return true;
    }

    const lastSeq = this.lastSeqById.get(id);
    if (lastSeq !== undefined && seq <= lastSeq) {
      return false;
    }

    this.lastSeqById.set(id, seq);
    return true;
  }

  reset(id?: string): void {
    if (id) {
      this.lastSeqById.delete(id);
    } else {
      this.lastSeqById.clear();
    }
  }
}

export default SequenceGate;
