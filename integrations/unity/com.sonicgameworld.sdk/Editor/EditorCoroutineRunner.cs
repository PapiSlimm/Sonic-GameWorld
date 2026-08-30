using System.Collections;
using UnityEditor;
using UnityEngine;

namespace SonicGameWorld.Editor
{
    /// <summary>
    /// Drives an <see cref="IEnumerator"/>-based SDK call (the same coroutine methods used at
    /// runtime via <c>MonoBehaviour.StartCoroutine</c>) from editor code, which has no
    /// coroutine host of its own. Ticks the enumerator once per <see cref="EditorApplication.update"/>,
    /// recursing into nested <c>yield return otherCoroutine</c> calls and waiting for
    /// <see cref="AsyncOperation"/>s (e.g. <c>UnityWebRequest.SendWebRequest()</c>) to report
    /// <see cref="AsyncOperation.isDone"/> before advancing past them — the same two "awaitable"
    /// shapes <c>MonoBehaviour.StartCoroutine</c> understands, which is all the SDK's own
    /// coroutines ever yield.
    /// </summary>
    internal static class EditorCoroutineRunner
    {
        public static void Start(IEnumerator routine)
        {
            EditorApplication.CallbackFunction tick = null;
            tick = () =>
            {
                try
                {
                    if (!Step(routine))
                    {
                        EditorApplication.update -= tick;
                    }
                }
                catch
                {
                    EditorApplication.update -= tick;
                    throw;
                }
            };
            EditorApplication.update += tick;
        }

        /// <summary>Advances one level of a (possibly nested) enumerator. Returns false when fully complete.</summary>
        private static bool Step(IEnumerator routine)
        {
            var current = routine.Current;

            if (current is IEnumerator nested)
            {
                if (Step(nested)) return true; // nested routine still running — don't advance yet
            }
            else if (current is AsyncOperation op && !op.isDone)
            {
                return true; // still waiting on the network request
            }

            return routine.MoveNext();
        }
    }
}
